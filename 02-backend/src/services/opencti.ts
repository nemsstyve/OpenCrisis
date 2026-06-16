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
              name: standard_id
            }
            ... on IPv4Addr {
              name: value
            }
            ... on IPv6Addr {
              name: value
            }
            ... on DomainName {
              name: value
            }
            ... on Url {
              name: value
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
      name: node.name ?? node.observable_value ?? node.id,
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
