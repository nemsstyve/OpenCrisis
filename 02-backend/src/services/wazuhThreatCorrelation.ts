/**
 * V0.4 — moteur read-only. PAS une route d'ingestion et PAS une authentification.
 * Le tenantId est issu EXCLUSIVEMENT d'un connecteur Wazuh authentifie cote serveur.
 * Aucun document, incident, audit prive ou proposition non validee n'est lu ici.
 */
import { GraphQLError } from 'graphql';
import { prisma } from '../prisma';
import { normalizeShareableIoC } from './sharedThreatPolicy';
import type { TrustedWazuhConnector } from './wazuhProposalIngestion';

export type WazuhIndicator = { type: string; value: string };
export type WazuhCorrelationInput = {
  externalEventId: string;
  indicators: WazuhIndicator[];
};
export type WazuhThreatMatch = {
  threatId: string;
  indicatorType: 'HASH_SHA256' | 'DOMAIN';
  indicatorValue: string;
  score: number;
  rationale: string;
  mitigation: string;
};
export type WazuhCorrelationResult = {
  externalEventId: string;
  matched: boolean;
  confidence: number;
  matches: WazuhThreatMatch[];
  analystReviewRequired: true;
  incidentAutomaticallyCreated: false;
};

/** Confiance dans la CORRESPONDANCE, jamais probabilite de compromission. */
const SCORES = { HASH_SHA256: 90, DOMAIN: 70 } as const;
const MAX_IOCS = 20;

function badInput(message: string): never {
  throw new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } });
}

export async function correlateTrustedWazuhAlert(
  connector: TrustedWazuhConnector,
  incoming: WazuhCorrelationInput,
): Promise<WazuhCorrelationResult> {
  if (!connector || typeof connector.tenantId !== 'string' || !connector.tenantId ||
      typeof connector.sourceId !== 'string' || !connector.sourceId) {
    return badInput('Identite de connecteur non authentifiee');
  }
  if (!incoming || typeof incoming.externalEventId !== 'string' ||
      !incoming.externalEventId.trim() || incoming.externalEventId.length > 200 ||
      !Array.isArray(incoming.indicators) || incoming.indicators.length > MAX_IOCS) {
    return badInput('Alerte Wazuh invalide');
  }
  const tenant = await prisma.tenant.findFirst({
    where: { id: connector.tenantId, isActive: true }, select: { id: true },
  });
  if (!tenant) return badInput('Tenant du connecteur inactif ou inconnu');

  const candidates = new Map<string, { type: 'HASH_SHA256' | 'DOMAIN'; value: string }>();
  for (const ioc of incoming.indicators) {
    if (!ioc || typeof ioc.type !== 'string' || typeof ioc.value !== 'string' ||
        ioc.value.length > 253) return badInput('Indicateur malforme');
    if (ioc.type !== 'HASH_SHA256' && ioc.type !== 'DOMAIN') continue;
    let normalized: string;
    try { normalized = normalizeShareableIoC(ioc.type, ioc.value); }
    catch { continue; } // Une IOC non publiable ne doit pas devenir un match.
    candidates.set(`${ioc.type}\u0000${normalized}`, { type: ioc.type, value: normalized });
  }

  const matchingIndicators = [...candidates.values()];
  const threats = matchingIndicators.length ? await prisma.sharedThreat.findMany({
    where: { revokedAt: null, OR: matchingIndicators.map(i => ({
      indicatorType: i.type, indicatorValue: i.value,
    })) },
    select: {
      id: true, indicatorType: true, indicatorValue: true, mitigation: true,
    },
    take: MAX_IOCS,
  }) : [];

  const matches: WazuhThreatMatch[] = threats
    .filter(t => t.indicatorType === 'HASH_SHA256' || t.indicatorType === 'DOMAIN')
    .map(t => {
      const type = t.indicatorType as 'HASH_SHA256' | 'DOMAIN';
      return {
        threatId: t.id, indicatorType: type, indicatorValue: t.indicatorValue,
        score: SCORES[type],
        rationale: type === 'HASH_SHA256'
          ? 'Correspondance exacte SHA-256 avec une menace approuvee'
          : 'Correspondance exacte de domaine avec une menace approuvee',
        mitigation: t.mitigation,
      };
    })
    .sort((a, b) => b.score - a.score || a.threatId.localeCompare(b.threatId));

  return {
    externalEventId: incoming.externalEventId,
    matched: matches.length > 0,
    confidence: matches.length ? matches[0].score : 0,
    matches,
    analystReviewRequired: true,
    incidentAutomaticallyCreated: false,
  };
}
