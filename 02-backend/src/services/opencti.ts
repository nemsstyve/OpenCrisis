import { GraphQLError } from 'graphql';
import { prisma } from '../prisma';
import { logAudit } from '../middleware/audit';

const OPENCTI_ENABLED = process.env.OPENCTI_ENABLED === 'true';
const OPENCTI_URL = process.env.OPENCTI_URL ?? '';
const OPENCTI_TOKEN = process.env.OPENCTI_TOKEN ?? '';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OpenCTIEntity {
  id: string;
  name: string;
  entity_type: string;
  description?: string | null;
}

// ─── Helpers privés ───────────────────────────────────────────────────────────

function checkEnabled() {
  if (!OPENCTI_ENABLED) {
    throw new GraphQLError('Intégration OpenCTI désactivée', {
      extensions: { code: 'OPENCTI_DISABLED' },
    });
  }
  if (!OPENCTI_URL || !OPENCTI_TOKEN) {
    throw new GraphQLError('OpenCTI non configuré (OPENCTI_URL ou OPENCTI_TOKEN manquant)', {
      extensions: { code: 'OPENCTI_MISCONFIGURED' },
    });
  }
}

async function openctiQuery(query: string, variables: Record<string, unknown> = {}) {
  const response = await fetch(`${OPENCTI_URL}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENCTI_TOKEN}`,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new GraphQLError(`Erreur OpenCTI HTTP ${response.status}`, {
      extensions: { code: 'OPENCTI_HTTP_ERROR' },
    });
  }

  const json = (await response.json()) as { data?: unknown; errors?: { message: string }[] };

  if (json.errors?.length) {
    throw new GraphQLError(`Erreur OpenCTI : ${json.errors[0].message}`, {
      extensions: { code: 'OPENCTI_GRAPHQL_ERROR' },
    });
  }

  return json.data;
}

// ─── Recherche d'entités ──────────────────────────────────────────────────────

export async function searchOpenCTIEntities(query: string): Promise<OpenCTIEntity[]> {
  checkEnabled();

  const gql = `
    query SearchEntities($search: String!) {
      stixCoreObjects(search: $search, first: 10) {
        edges {
          node {
            id
            entity_type
            ... on StixDomainObject { standard_id }
            ... on IPv4Addr          { observable_value }
            ... on IPv6Addr          { observable_value }
            ... on DomainName        { observable_value }
            ... on Url               { observable_value }
            ... on StixCyberObservable { observable_value }
            ... on Report      { name description }
            ... on Malware     { name description }
            ... on ThreatActor { name description }
            ... on AttackPattern { name description }
            ... on Indicator   { name description }
          }
        }
      }
    }
  `;

  try {
    const data = (await openctiQuery(gql, { search: query })) as {
      stixCoreObjects?: {
        edges: {
          node: {
            id: string;
            entity_type: string;
            name?: string;
            standard_id?: string;
            observable_value?: string;
            description?: string;
          };
        }[];
      };
    };

    if (!data?.stixCoreObjects?.edges) return [];

    return data.stixCoreObjects.edges.map(({ node }) => ({
      id: node.id,
      entity_type: node.entity_type,
      name: node.name ?? node.observable_value ?? node.standard_id ?? node.id,
      description: node.description ?? null,
    }));
  } catch (err) {
    if (err instanceof GraphQLError) throw err;
    console.error('[OpenCTI] Erreur de recherche:', err);
    return [];
  }
}

// ─── Lier un événement Timeline à une entité OpenCTI ─────────────────────────

export async function linkTimelineEventToOpenCTI(
  eventId: string,
  openctiEntityId: string,
  openctiEntityType: string,
  userId: string,
  ipAddress?: string | null,
) {
  checkEnabled();

  const event = await prisma.timelineEvent.findFirst({ where: { id: eventId, deletedAt: null } });
  if (!event) {
    throw new GraphQLError('Événement introuvable', { extensions: { code: 'NOT_FOUND' } });
  }

  const updated = await prisma.timelineEvent.update({
    where: { id: eventId },
    data: { openctiEntityId, openctiEntityType },
    include: { actor: true },
  });

  logAudit({
    userId,
    action: 'LINK_OPENCTI',
    resource: 'TIMELINE',
    resourceId: eventId,
    incidentId: event.incidentId,
    ipAddress,
    metadata: { openctiEntityId, openctiEntityType },
  });

  return updated;
}

// ─── Délier un événement Timeline d'OpenCTI ──────────────────────────────────

export async function unlinkTimelineEventFromOpenCTI(
  eventId: string,
  userId: string,
  ipAddress?: string | null,
) {
  checkEnabled();

  const event = await prisma.timelineEvent.findFirst({ where: { id: eventId, deletedAt: null } });
  if (!event) {
    throw new GraphQLError('Événement introuvable', { extensions: { code: 'NOT_FOUND' } });
  }

  const updated = await prisma.timelineEvent.update({
    where: { id: eventId },
    data: { openctiEntityId: null, openctiEntityType: null },
    include: { actor: true },
  });

  logAudit({
    userId,
    action: 'UNLINK_OPENCTI',
    resource: 'TIMELINE',
    resourceId: eventId,
    incidentId: event.incidentId,
    ipAddress,
  });

  return updated;
}

// ─── Exporter un incident en Case STIX dans OpenCTI ──────────────────────────

export async function exportIncidentToOpenCTI(
  incidentId: string,
  userId: string,
  ipAddress?: string | null,
) {
  checkEnabled();

  const incident = await prisma.incident.findFirst({
    where: { id: incidentId, deletedAt: null },
    include: { timelineEvents: { where: { deletedAt: null } } },
  });

  if (!incident) {
    throw new GraphQLError('Incident introuvable', { extensions: { code: 'NOT_FOUND' } });
  }

  const severityMap: Record<string, string> = {
    LOW: 'low', MEDIUM: 'medium', HIGH: 'high', CRITICAL: 'critical',
  };

  const gql = `
    mutation CreateCase($input: CaseIncidentAddInput!) {
      caseIncidentAdd(input: $input) {
        id
        name
        entity_type
      }
    }
  `;

  const data = (await openctiQuery(gql, {
    input: {
      name: incident.name,
      description: incident.description ?? '',
      severity: severityMap[incident.severity] ?? 'medium',
      priority: incident.severity === 'CRITICAL' ? 'P1'
        : incident.severity === 'HIGH' ? 'P2' : 'P3',
    },
  })) as { caseIncidentAdd?: { id: string; name: string; entity_type: string } };

  const caseIncident = data?.caseIncidentAdd;
  const caseId = caseIncident?.id;

  if (!caseId) {
    throw new GraphQLError("OpenCTI n'a pas retourné d'identifiant pour le case créé", {
      extensions: { code: 'OPENCTI_EMPTY_RESPONSE' },
    });
  }

  await prisma.incident.update({ where: { id: incidentId }, data: { openctiCaseId: caseId } });

  logAudit({
    userId,
    action: 'EXPORT_OPENCTI',
    resource: 'TIMELINE',
    resourceId: incidentId,
    incidentId,
    ipAddress,
    metadata: { openctiCaseId: caseId },
  });

  return {
    id: caseId,
    name: caseIncident.name,
    entity_type: caseIncident.entity_type,
  };
}

// ─── Créer un observable dans OpenCTI ────────────────────────────────────────
// Utilisé pour pousser un IoC local vers OpenCTI quand il n'y figure pas encore.

const VALID_OBSERVABLE_TYPES = new Set([
  'IPv4-Addr', 'IPv6-Addr', 'Domain-Name', 'Hostname', 'StixFile', 'Url',
]);

export async function createOpenCTIObservable(
  type: string,
  value: string,
  description: string,
  userId?: string,
  ip?: string,
): Promise<OpenCTIEntity> {
  checkEnabled();

  if (!VALID_OBSERVABLE_TYPES.has(type)) {
    throw new GraphQLError(`Type d'observable non supporté : ${type}`, {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  // OpenCTI attend le nom du champ d'input calé sur le type (ex: IPv4Addr, DomainName)
  const inputKey = type.replace(/-/g, '');

  const gql = `
    mutation CreateObservable($type: String!, $value: String!) {
      stixCyberObservableAdd(type: $type, ${inputKey}: { value: $value }) {
        id
        entity_type
        observable_value
      }
    }
  `;

  const data = (await openctiQuery(gql, { type, value })) as {
    stixCyberObservableAdd?: { id: string; entity_type: string; observable_value: string };
  };

  const result = {
    id: data?.stixCyberObservableAdd?.id ?? '',
    name: data?.stixCyberObservableAdd?.observable_value ?? value,
    entity_type: data?.stixCyberObservableAdd?.entity_type ?? type,
    description,
  };

  logAudit({ userId, action: 'CREATE_OPENCTI_OBSERVABLE', resource: 'TIMELINE', resourceId: result.id, ipAddress: ip });

  return result;
}
