import { Router } from 'express';
import type {
  Request,
  Response,
  NextFunction,
} from 'express';
import { createHash } from 'node:crypto';
import {
  isValidWazuhConnectorSecret,
} from '../services/wazuhConnectorCredentials';
import { prisma } from '../prisma';

import {
  ingestAuthenticatedWazuhAlert,
  WazuhTenantMismatchError,
  WazuhAuthenticatedRateLimitError,
} from '../services/wazuhAuthenticatedIngestion';

import {
  WazuhProposalConflictError,
} from '../services/wazuhProposalIngestion';

const router = Router();

const MAX_BODY_BYTES = 64 * 1024;
const RATE_WINDOW_MS = 60_000;
const MAX_RATE_KEYS = 10_000;

// Plafond de securite par adresse socket.
// Il reste partage lorsque plusieurs clients passent
// par un meme reverse-proxy.
const MAX_REMOTE_REQUESTS = 600;

// Quota d'ingestion reserve aux connecteurs authentifies.
const MAX_CREDENTIAL_REQUESTS = 60;

interface RateEntry {
  count: number;
  expiresAt: number;
}

const remoteEntries = new Map<string, RateEntry>();
const anonymousEntries = new Map<string, RateEntry>();
const failedCredentialEntries = new Map<string, RateEntry>();
const authenticatedEntries = new Map<string, RateEntry>();

function rateAllowed(
  entries: Map<string, RateEntry>,
  key: string,
  limit: number,
): boolean {
  const now = Date.now();

  if (entries.size >= MAX_RATE_KEYS) {
    for (const [entryKey, value] of entries) {
      if (value.expiresAt <= now) {
        entries.delete(entryKey);
      }
    }
  }

  const current = entries.get(key);

  if (!current || current.expiresAt <= now) {
    if (!current && entries.size >= MAX_RATE_KEYS) {
      return false;
    }

    entries.set(key, {
      count: 1,
      expiresAt: now + RATE_WINDOW_MS,
    });

    return true;
  }

  if (current.count >= limit) {
    return false;
  }

  current.count += 1;
  return true;
}

function rateAllowedRemote(remoteAddress: string): boolean {
  return rateAllowed(
    remoteEntries,
    remoteAddress,
    MAX_REMOTE_REQUESTS,
  );
}

// Indique qu'une requete a deja passe le quota reseau
// avant l'analyse JSON. WeakSet n'empeche pas le GC.
const precheckedRequests = new WeakSet<Request>();

export function preparseWazuhRateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');

  const remoteAddress = req.socket.remoteAddress;

  if (!remoteAddress) {
    res.status(503).json({
      error: 'Service indisponible',
    });
    return;
  }

  if (!rateAllowedRemote(remoteAddress)) {
    res.status(429).json({
      error: 'Limite de requetes atteinte',
    });
    return;
  }

  precheckedRequests.add(req);
  next();
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function validText(
  value: unknown,
  maxLength: number,
): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

function validAlert(
  value: unknown,
): value is {
  externalEventId: string;
  title: string;
  description?: string | null;
  eventTenantId?: string | null;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
} {
  if (!isRecord(value)) {
    return false;
  }

  const allowedKeys = new Set([
    'externalEventId',
    'title',
    'description',
    'eventTenantId',
    'severity',
  ]);

  if (
    Object.keys(value).some(key => !allowedKeys.has(key))
  ) {
    return false;
  }

  if (
    !validText(value.externalEventId, 255) ||
    !validText(value.title, 255)
  ) {
    return false;
  }

  if (
    value.description !== undefined &&
    value.description !== null &&
    (
      typeof value.description !== 'string' ||
      value.description.length > 4000
    )
  ) {
    return false;
  }

  if (
    value.eventTenantId !== undefined &&
    value.eventTenantId !== null &&
    !validText(value.eventTenantId, 255)
  ) {
    return false;
  }

  return (
    value.severity === 'LOW' ||
    value.severity === 'MEDIUM' ||
    value.severity === 'HIGH' ||
    value.severity === 'CRITICAL'
  );
}

/*
 * Aucun corps de requete, identifiant machine ou secret
 * n'est journalise par cette route.
 *
 * La protection des journaux de reverse-proxy doit etre
 * verifiee avant tout deploiement operationnel.
 */
router.post('/alerts', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');

  const remoteAddress = req.socket.remoteAddress;

  if (!remoteAddress) {
    res.status(503).json({ error: 'Service indisponible' });
    return;
  }

  const candidateId =
    req.headers['x-opencrisis-connector-id'];
  const candidateSecret =
    req.headers['x-opencrisis-connector-secret'];

  // La route peut aussi etre montee seule dans un test
  // HTTP. Eviter de compter deux fois si le preparse
  // du serveur principal a deja autorise la requete.
  if (
    !precheckedRequests.has(req) &&
    !rateAllowedRemote(remoteAddress)
  ) {
    res.status(429).json({
      error: 'Limite de requetes atteinte',
    });
    return;
  }

  // Les identifiants invalides au niveau du format utilisent
  // le quota anonyme. Les secrets incorrects ne doivent jamais
  // consommer le quota d'un connecteur authentifie.
  const candidateIdValid =
    typeof candidateId === 'string' &&
    candidateId.length > 0 &&
    candidateId.length <= 255 &&
    candidateId.trim() === candidateId;

  if (
    !candidateIdValid &&
    !rateAllowed(anonymousEntries, remoteAddress, 60)
  ) {
    res.status(429).json({
      error: 'Limite de requetes atteinte',
    });
    return;
  }

  const connectorRateKey = candidateIdValid
    ? createHash('sha256')
        .update('opencrisis:wazuh:connector-id:')
        .update(candidateId)
        .digest('hex')
    : null;

  // Ce callback est exclusivement synchrone.
  // Il est appele par le service APRES verification du secret,
  // alors que les verrous PostgreSQL sont encore detenus.
  const allowAuthenticated = (): boolean => {
    if (connectorRateKey === null) {
      return false;
    }

    return rateAllowed(
      authenticatedEntries,
      connectorRateKey,
      MAX_CREDENTIAL_REQUESTS,
    );
  };

  const contentType = req.headers['content-type'];

  if (
    typeof contentType !== 'string' ||
    !/^application\/json(?:\s*;|$)/i.test(contentType)
  ) {
    res.status(415).json({ error: 'JSON requis' });
    return;
  }

  if (
    typeof req.headers['content-length'] === 'string' &&
    (
      !/^\d+$/.test(req.headers['content-length']) ||
      Number(req.headers['content-length']) > MAX_BODY_BYTES
    )
  ) {
    res.status(413).json({ error: 'Requete trop volumineuse' });
    return;
  }

  const body = req.body as unknown;

  if (!isRecord(body)) {
    res.status(400).json({ error: 'Alerte invalide' });
    return;
  }

  if (
    Buffer.byteLength(JSON.stringify(body), 'utf8') >
    MAX_BODY_BYTES
  ) {
    res.status(413).json({ error: 'Requete trop volumineuse' });
    return;
  }

  if (!validAlert(body)) {
    res.status(400).json({ error: 'Alerte invalide' });
    return;
  }

  const connectorId =
    req.headers['x-opencrisis-connector-id'];

  const secret =
    req.headers['x-opencrisis-connector-secret'];

  if (
    typeof connectorId !== 'string' ||
    typeof secret !== 'string'
  ) {
    res.status(401).json({ error: 'Authentification refusee' });
    return;
  }

  try {
    const result = await ingestAuthenticatedWazuhAlert(
      prisma,
      connectorId,
      secret,
      body,
      allowAuthenticated,
    );

    if (!result) {
      const failureKey = connectorRateKey ?? remoteAddress;
      const allowed = rateAllowed(
        failedCredentialEntries,
        failureKey,
        60,
      );

      res.status(allowed ? 401 : 429).json({
        error: allowed
          ? 'Authentification refusee'
          : 'Limite de requetes atteinte',
      });
      return;
    }

    res
      .status(result.decision === 'PROPOSE' ? 202 : 200)
      .json({
        decision: result.decision,
        proposalId: result.proposalId,
        duplicate: result.duplicate,
      });
  } catch (error) {
    if (error instanceof WazuhAuthenticatedRateLimitError) {
      res.status(429).json({
        error: 'Limite de requetes atteinte',
      });
      return;
    }

    if (error instanceof WazuhTenantMismatchError) {
      res.status(400).json({
        error: 'Entreprise declaree invalide',
      });
      return;
    }

    if (error instanceof WazuhProposalConflictError) {
      res.status(409).json({
        error: 'Conflit avec un evenement existant',
      });
      return;
    }

    // Aucun detail SQL, secret ou stack trace dans la reponse.
    res.status(500).json({
      error: 'Traitement indisponible',
    });
  }
});

export default router;
