/**
 * OpenCrisis - Politique de qualification des alertes.
 *
 * Ce module ne lit ni ne modifie la base de donnees.
 *
 * connectorTenantId doit provenir exclusivement
 * d'un connecteur authentifie cote serveur.
 *
 * automationApproved doit provenir d'une configuration
 * administrative validee, jamais du contenu de l'alerte.
 */

export type IncidentIngestionMode =
  | 'MANUAL'
  | 'SEMI_AUTOMATIC'
  | 'AUTOMATIC';

export type IncidentAlertSeverity =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL';

export type IncidentIngestionDecision =
  | 'MANUAL_ONLY'
  | 'PROPOSE'
  | 'AUTO_CREATE_ELIGIBLE';

export interface IncidentAlertPolicyInput {
  connectorTenantId: string;
  eventTenantId?: string | null;
  sourceId: string;
  externalEventId: string;
  mode: IncidentIngestionMode;
  severity: IncidentAlertSeverity;
  automationApproved: boolean;
}

export interface IncidentAlertPolicyResult {
  tenantId: string;
  sourceId: string;
  externalEventId: string;
  decision: IncidentIngestionDecision;
  reason: string;
}

function requiredIdentifier(
  value: unknown,
  field: string,
): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > 255
  ) {
    throw new Error(`Identifiant invalide : ${field}`);
  }

  return value;
}

export function evaluateIncidentAlert(
  input: IncidentAlertPolicyInput,
): IncidentAlertPolicyResult {
  const tenantId = requiredIdentifier(
    input.connectorTenantId,
    'connectorTenantId',
  );

  const sourceId = requiredIdentifier(
    input.sourceId,
    'sourceId',
  );

  const externalEventId = requiredIdentifier(
    input.externalEventId,
    'externalEventId',
  );

  if (
    input.eventTenantId !== undefined &&
    input.eventTenantId !== null &&
    input.eventTenantId !== tenantId
  ) {
    throw new Error(
      'Alerte refusee : incoherence inter-tenant',
    );
  }

  if (
    ![
      'MANUAL',
      'SEMI_AUTOMATIC',
      'AUTOMATIC',
    ].includes(input.mode)
  ) {
    throw new Error('Mode ingestion invalide');
  }

  if (
    ![
      'LOW',
      'MEDIUM',
      'HIGH',
      'CRITICAL',
    ].includes(input.severity)
  ) {
    throw new Error('Gravite invalide');
  }

  if (typeof input.automationApproved !== 'boolean') {
    throw new Error(
      'Configuration automatisation invalide',
    );
  }

  const base = {
    tenantId,
    sourceId,
    externalEventId,
  };

  if (input.mode === 'MANUAL') {
    return {
      ...base,
      decision: 'MANUAL_ONLY',
      reason: 'Creation reservee aux utilisateurs habilites',
    };
  }

  if (input.mode === 'SEMI_AUTOMATIC') {
    return {
      ...base,
      decision: 'PROPOSE',
      reason: 'Validation humaine obligatoire',
    };
  }

  if (
    input.severity === 'CRITICAL' &&
    input.automationApproved
  ) {
    return {
      ...base,
      decision: 'AUTO_CREATE_ELIGIBLE',
      reason: 'Automatisation admissible selon politique',
    };
  }

  return {
    ...base,
    decision: 'PROPOSE',
    reason: 'Validation humaine requise',
  };
}
