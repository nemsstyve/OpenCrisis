/**
 * V0.4 : point d'entree SERVICE, non expose en HTTP.
 * Ne jamais accepter un TrustedWazuhConnector du corps de requete.
 * Le tenant est exclusivement issu de l'authentification machine existante.
 * La correlation n'ecrit pas de proposition, incident, document ou audit.
 */
import type { PrismaClient } from '@prisma/client';
import { GraphQLError } from 'graphql';
import { authenticateWazuhConnector } from './wazuhConnectorAuthentication';
import {
  correlateTrustedWazuhAlert,
  type WazuhCorrelationInput,
  type WazuhCorrelationResult,
} from './wazuhThreatCorrelation';

export type AuthenticatedCorrelationInput = WazuhCorrelationInput & {
  eventTenantId?: string | null;
};

export async function correlateAuthenticatedWazuhAlert(
  db: PrismaClient,
  connectorId: unknown,
  presentedSecret: unknown,
  alert: AuthenticatedCorrelationInput,
): Promise<WazuhCorrelationResult | null> {
  // Pas de correlation si l'authentification, la revocation ou le tenant echoue.
  const authenticated = await authenticateWazuhConnector(db, connectorId, presentedSecret);
  if (!authenticated) return null;
  if (!alert || typeof alert !== 'object' ||
      (alert.eventTenantId !== undefined && alert.eventTenantId !== null &&
       alert.eventTenantId !== authenticated.tenantId)) {
    throw new GraphQLError('Entreprise declaree incompatible avec le connecteur', {
      extensions: { code: 'FORBIDDEN' },
    });
  }
  // Conserver uniquement l'identite derivee de la base de donnees.
  return correlateTrustedWazuhAlert(
    { tenantId: authenticated.tenantId, sourceId: authenticated.sourceId },
    { externalEventId: alert.externalEventId, indicators: alert.indicators },
  );
}

// V0.4 - La source et le tenant proviennent du connecteur authentifie.
export async function correlateAuthenticatedWazuhAlertWithIdentity(
  db: PrismaClient,
  connectorId: unknown,
  presentedSecret: unknown,
  alert: AuthenticatedCorrelationInput,
): Promise<{
  tenantId: string;
  sourceId: string;
  result: WazuhCorrelationResult;
} | null> {
  const authenticated = await authenticateWazuhConnector(
    db,
    connectorId,
    presentedSecret,
  );

  if (!authenticated) return null;

  if (
    !alert ||
    typeof alert !== 'object' ||
    (
      alert.eventTenantId !== undefined &&
      alert.eventTenantId !== null &&
      alert.eventTenantId !== authenticated.tenantId
    )
  ) {
    throw new GraphQLError(
      'Entreprise declaree incompatible avec le connecteur',
      { extensions: { code: 'FORBIDDEN' } },
    );
  }

  const result = await correlateTrustedWazuhAlert(
    {
      tenantId: authenticated.tenantId,
      sourceId: authenticated.sourceId,
    },
    {
      externalEventId: alert.externalEventId,
      indicators: alert.indicators,
    },
  );

  return {
    tenantId: authenticated.tenantId,
    sourceId: authenticated.sourceId,
    result,
  };
}
