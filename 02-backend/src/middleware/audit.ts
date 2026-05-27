import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';

interface AuditParams {
  userId?: string | null;
  action: string;
  resource: string;
  resourceId?: string;
  incidentId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}

export async function logAudit(params: AuditParams): Promise<void> {
  const data: Prisma.AuditLogUncheckedCreateInput = {
    action: params.action,
    resource: params.resource,
    userId: params.userId ?? undefined,
    ipAddress: params.ipAddress ?? undefined,
    resourceId: params.resourceId,
    incidentId: params.incidentId,
    metadata: params.metadata as Prisma.InputJsonValue | undefined,
  };
  await prisma.auditLog.create({ data });
}
