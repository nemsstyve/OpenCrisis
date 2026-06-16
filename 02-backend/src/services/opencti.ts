import { GraphQLError } from 'graphql';
import { prisma } from '../prisma';
import { logAudit } from '../middleware/audit';

const OPENCTI_ENABLED = process.env.OPENCTI_ENABLED === 'true';
const OPENCTI_URL = process.env.OPENCTI_URL ?? '';
const OPENCTI_TOKEN = process.env.OPENCTI_TOKEN ?? '';

// ─── Types OpenCTI ────────────────────────────────────────────────────────────

export interface OpenCTIEntity {
  id: string;
  name: string;
  entity_type: string;
  description?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    signal: AbortSignal.timeout(10000), // 10s timeout
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

// ─── Recherche d'entités OpenCTI ──────────────────────────────────────────────

export async function searchOpenCTIEntities(query: string): Promise<OpenCTIEntity[]> {
  checkEnabled();

  const gql = `
    query SearchEntities($search: String!) {
      stixCoreObjects(search: $search, first: 10) {
        edges {
          node {
            id
            entity_type
            ... on StixDomainObject {
              standard_id
            }
            ... on IPv4Addr {
              observable_value
            }
            ... on IPv6Addr {
              observable_value
            }
            ... on DomainName {
              observable_value
            }
            ... on Url {
              observable_value
            }
            ... on StixCyberObservable {
              observable_value
            }
            ... on Report {
              name
              description
            }
            ... on Malware {
              name
              description
            }
            ... on ThreatActor {
              name
              description
            }
            ... on AttackPattern {
              name
              description
            }
            ... on Indicator {
              name
              description
            }
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
    // Si OpenCTI ne répond pas, on retourne un tableau vide plutôt que de planter
    if (err instanceof GraphQLError) throw err;
    console.error('[OpenCTI] Erreur de recherche:', err);
    return [];
  }
}

// ─── Lier un événement Timeline à une entité OpenCTI ──────────────────────────

export async function linkTimelineEventToOpenCTI(
  eventId: string,
  openctiEntityId: string,
  openctiEntityType: string,
  userId: string,
  ipAddress?: string | null,
) {
  checkEnabled();

  const event = await prisma.timelineEvent.findUnique({ where: { id: eventId } });
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

// ─── Délier un événement Timeline d'OpenCTI ───────────────────────────────────

export async function unlinkTimelineEventFromOpenCTI(
  eventId: string,
  userId: string,
  ipAddress?: string | null,
) {
  checkEnabled();

  const event = await prisma.timelineEvent.findUnique({ where: { id: eventId } });
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

// ─── Export incident → Case STIX OpenCTI ──────────────────────────────────────

export async function exportIncidentToOpenCTI(
  incidentId: string,
  userId: string,
  ipAddress?: string | null,
) {
  checkEnabled();

  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
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

  const data = await openctiQuery(gql, {
    input: {
      name: incident.name,
      description: incident.description ?? '',
      severity: severityMap[incident.severity] ?? 'medium',
      priority: incident.severity === 'CRITICAL' ? 'P1' : incident.severity === 'HIGH' ? 'P2' : 'P3',
    },
  }) as { caseIncidentAdd?: { id: string; name: string; entity_type: string } };

  const caseId = data?.caseIncidentAdd?.id;

  if (caseId) {
    await prisma.incident.update({
      where: { id: incidentId },
      data: { openctiCaseId: caseId },
    });

    logAudit({
      userId,
      action: 'EXPORT_OPENCTI',
      resource: 'INCIDENT',
      resourceId: incidentId,
      incidentId,
      ipAddress,
      metadata: { openctiCaseId: caseId, caseEntityType: data?.caseIncidentAdd?.entity_type },
    });
  }

  return {
    id: caseId ?? '',
    name: data?.caseIncidentAdd?.name ?? incident.name,
    entity_type: data?.caseIncidentAdd?.entity_type ?? 'Case-Incident',
  };
}

// ─── Export incident → Case STIX OpenCTI ──────────────────────────────────────

// ─── Créer un observable dans OpenCTI ─────────────────────────────────────────

export async function createOpenCTIObservable(
  type: string,
  value: string,
  description: string,
) {
  checkEnabled();

  const typeMap: Record<string, string> = {
    'IPv4-Addr': 'iPv4AddrAdd',
    'Domain-Name': 'domainNameAdd',
    'Hostname': 'hostnameAdd',
    'StixFile': 'stixFileAdd',
  };

  const mutation = typeMap[type] ?? 'iPv4AddrAdd';

  const gql = `
    mutation CreateObservable($type: String!, $IPv4Addr: IPv4AddrAddInput) {
      stixCyberObservableAdd(type: $type, IPv4Addr: $IPv4Addr) {
        id
        entity_type
        observable_value
      }
    }
  `;

  const data = await openctiQuery(gql, {
    type,
    IPv4Addr: {
      value,
    },
  }) as { stixCyberObservableAdd?: { id: string; entity_type: string; observable_value: string } };

  return {
    id: data?.stixCyberObservableAdd?.id ?? '',
    name: data?.stixCyberObservableAdd?.observable_value ?? value,
    entity_type: data?.stixCyberObservableAdd?.entity_type ?? type,
  };
}
