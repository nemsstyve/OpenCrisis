/** V0.4. Correlation en lecture seule : aucun incident ni proposition cree. */
import { Router } from 'express';
import { GraphQLError } from 'graphql';
import { prisma } from '../prisma';
import { correlateAuthenticatedWazuhAlert } from '../services/wazuhAuthenticatedCorrelation';

const router = Router();
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

function validAlert(value: unknown): value is {
  externalEventId: string;
  eventTenantId?: string | null;
  indicators: Array<{ type: string; value: string }>;
} {
  if (!record(value)) return false;
  const keys = ['externalEventId', 'eventTenantId', 'indicators'];
  if (Object.keys(value).some(k => !keys.includes(k))) return false;
  if (typeof value.externalEventId !== 'string' ||
      !value.externalEventId.trim() || value.externalEventId.length > 200) return false;
  if (value.eventTenantId !== undefined && value.eventTenantId !== null &&
      (typeof value.eventTenantId !== 'string' || value.eventTenantId.length > 255)) return false;
  if (!Array.isArray(value.indicators) || value.indicators.length > 20) return false;
  return value.indicators.every(i => record(i) &&
    Object.keys(i).every(k => ['type', 'value'].includes(k)) &&
    typeof i.type === 'string' && i.type.length <= 30 &&
    typeof i.value === 'string' && i.value.length <= 253);
}

router.post('/correlate', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  const connectorId = req.headers['x-opencrisis-connector-id'];
  const secret = req.headers['x-opencrisis-connector-secret'];
  if (typeof connectorId !== 'string' || typeof secret !== 'string') {
    res.status(401).json({ error: 'Authentification refusee' }); return;
  }
  if (!validAlert(req.body)) {
    res.status(400).json({ error: 'Alerte invalide' }); return;
  }
  try {
    const result = await correlateAuthenticatedWazuhAlert(prisma, connectorId, secret, req.body);
    if (!result) {
      res.status(401).json({ error: 'Authentification refusee' }); return;
    }
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof GraphQLError) {
      const code = error.extensions?.code;
      if (code === 'FORBIDDEN') {
        res.status(403).json({ error: 'Acces refuse' }); return;
      }
      if (code === 'BAD_USER_INPUT') {
        res.status(400).json({ error: 'Alerte invalide' }); return;
      }
    }
    console.error('[wazuh-correlation] correlation failed', {
      name: error instanceof Error ? error.name : 'UnknownError',
    });
    res.status(500).json({ error: 'Erreur interne' });
  }
});

export default router;
