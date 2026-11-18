import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { resolveAuditTenantId } from './auditTenantPolicy';

interface AuditParams {
  userId?: string | null;
  action: string;
  resource: string;
  resourceId?: string;
  incidentId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

/**
 * Determine le tenant a partir des donnees PostgreSQL,
 * jamais depuis une valeur provenant du client.
 *
 * Les evenements metier sans tenant valide sont refuses.
 * LOGIN_FAILED anonyme peut rester global.
 */
async function persistAudit(params: AuditParams): Promise<void> {
  const [actor, incident] = await Promise.all([
    params.userId
      ? prisma.user.findUnique({
          where: { id: params.userId },
          select: { tenantId: true },
        })
      : Promise.resolve(null),

    params.incidentId
      ? prisma.incident.findUnique({
          where: { id: params.incidentId },
          select: { tenantId: true },
        })
      : Promise.resolve(null),
  ]);

  const tenantId = resolveAuditTenantId({
    userId: params.userId,
    incidentId: params.incidentId,
    userTenantId: actor?.tenantId,
    incidentTenantId: incident?.tenantId,
    resource: params.resource,
    action: params.action,
  });

  const data: Prisma.AuditLogUncheckedCreateInput = {
    tenantId: tenantId ?? undefined,
    action: params.action,
    resource: params.resource,
    userId: params.userId ?? undefined,
    ipAddress: params.ipAddress ?? undefined,
    resourceId: params.resourceId,
    incidentId: params.incidentId,
    metadata:
      params.metadata as Prisma.InputJsonValue | undefined,
  };

  await prisma.auditLog.create({ data });
}

export function logAudit(params: AuditParams): void {
  void persistAudit(params).catch(err => {
    console.error('[audit] write failed:', err);
  });
}
