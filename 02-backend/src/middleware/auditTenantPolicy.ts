export interface AuditTenantInput {
  userId?: string | null;
  incidentId?: string | null;
  userTenantId?: string | null;
  incidentTenantId?: string | null;
  resource: string;
  action: string;
}

/**
 * Regle pure d'attribution d'un audit a un tenant.
 * Les identifiants de tenant doivent provenir de PostgreSQL.
 */
export function resolveAuditTenantId(
  input: AuditTenantInput,
): string | null {
  if (input.userId && !input.userTenantId) {
    throw new Error(
      'Audit refuse : utilisateur sans tenant valide',
    );
  }

  if (input.incidentId && !input.incidentTenantId) {
    throw new Error(
      'Audit refuse : incident sans tenant valide',
    );
  }

  if (
    input.userTenantId &&
    input.incidentTenantId &&
    input.userTenantId !== input.incidentTenantId
  ) {
    throw new Error(
      'Audit refuse : incoherence inter-tenant',
    );
  }

  const tenantId =
    input.incidentTenantId ?? input.userTenantId ?? null;

  const anonymousLoginFailure =
    input.resource === 'AUTH' &&
    input.action === 'LOGIN_FAILED' &&
    !input.userId &&
    !input.incidentId;

  if (!tenantId && !anonymousLoginFailure) {
    throw new Error(
      'Audit refuse : entreprise introuvable',
    );
  }

  return tenantId;
}
