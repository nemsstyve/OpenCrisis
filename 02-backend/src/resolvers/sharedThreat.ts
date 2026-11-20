import { randomUUID } from 'node:crypto';
import { GraphQLError } from 'graphql';
import type { GraphQLContext } from '../context';
import { prisma } from '../prisma';
import { requirePermission, requireAuth } from '../middleware/rbac';
import { requireTenantId } from '../middleware/tenant';
import { normalizeShareableIoC, validatedPublicText } from '../services/sharedThreatPolicy';

function denied(): never {
  throw new GraphQLError('Permission refusee', { extensions: { code: 'FORBIDDEN' } });
}
function missing(): never {
  throw new GraphQLError('Ressource introuvable', { extensions: { code: 'NOT_FOUND' } });
}
function reviewer(ctx: GraphQLContext): string {
  const userId = requireAuth(ctx);
  const permitted = (process.env.THREAT_REVIEWER_USER_IDS ?? '')
    .split(',').map(s => s.trim()).filter(Boolean);
  if (!permitted.includes(userId)) return denied();
  return userId;
}
function validTime(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}
const threatFields = {
  id: true, indicatorType: true, indicatorValue: true, title: true,
  mitigation: true, publishedAt: true,
} as const;

export const sharedThreatResolvers = {
  Query: {
    publishedThreats: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      await requirePermission(ctx, 'BIBLIOTHEQUE', 'READ');
      await requireTenantId(ctx);
      return prisma.sharedThreat.findMany({
        where: { revokedAt: null }, select: threatFields,
        orderBy: { publishedAt: 'desc' }, take: 200,
      });
    },
    myThreatSubmissions: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      await requirePermission(ctx, 'BIBLIOTHEQUE', 'READ');
      const tenantId = await requireTenantId(ctx);
      return prisma.threatSubmission.findMany({
        where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 100,
      });
    },
    pendingThreatSubmissions: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      await requirePermission(ctx, 'ADMIN', 'WRITE');
      await requireTenantId(ctx);
      reviewer(ctx);
      return prisma.threatSubmission.findMany({
        where: { status: 'PENDING', tenant: { isActive: true } },
        orderBy: { createdAt: 'asc' }, take: 100,
      });
    },
    incidentThreatAssociations: async (
      _: unknown, { incidentId }: { incidentId: string }, ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'DASHBOARD', 'READ');
      const tenantId = await requireTenantId(ctx);
      const incident = await prisma.incident.findFirst({
        where: { id: incidentId, tenantId, deletedAt: null }, select: { id: true },
      });
      if (!incident) return missing();
      return prisma.incidentThreatLink.findMany({
        where: { incidentId, tenantId, threat: { revokedAt: null } },
        include: { threat: { select: threatFields } },
        orderBy: { createdAt: 'desc' },
      });
    },
  },
  Mutation: {
    proposeThreatFromIoC: async (
      _: unknown,
      args: { iocId: string; title: string; mitigation: string },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'TIMELINE', 'READ');
      await requirePermission(ctx, 'BIBLIOTHEQUE', 'WRITE');
      const tenantId = await requireTenantId(ctx);
      const userId = requireAuth(ctx);
      const ioc = await prisma.ioC.findFirst({
        where: { id: args.iocId, timelineEvent: {
          deletedAt: null, incident: { tenantId, deletedAt: null },
        } },
        select: { id: true, type: true, value: true },
      });
      if (!ioc) return missing();
      const value = normalizeShareableIoC(ioc.type, ioc.value);
      const title = validatedPublicText(args.title, 'Titre', 180);
      const mitigation = validatedPublicText(args.mitigation, 'Recommandation', 2000);
      return prisma.$transaction(async tx => {
        const current = await tx.ioC.findFirst({
          where: { id: ioc.id, timelineEvent: {
            deletedAt: null, incident: { tenantId, deletedAt: null },
          } }, select: { id: true },
        });
        if (!current) return missing();
        const created = await tx.threatSubmission.create({
          data: {
            id: randomUUID(), tenantId, sourceIoCId: ioc.id,
            indicatorType: ioc.type, indicatorValue: value, title, mitigation,
            submittedById: userId,
          },
        });
        await tx.auditLog.create({ data: {
          tenantId, userId, action: 'PROPOSE_THREAT', resource: 'THREAT_SUBMISSION',
          resourceId: created.id, metadata: { indicatorType: ioc.type },
        } });
        return created;
      });
    },
    decideThreatSubmission: async (
      _: unknown,
      args: { submissionId: string; approve: boolean; reason?: string },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'ADMIN', 'WRITE');
      await requireTenantId(ctx);
      const reviewerId = reviewer(ctx);
      const reason = args.reason == null ? null :
        validatedPublicText(args.reason, 'Justification', 500);
      if (!args.approve && !reason) {
        throw new GraphQLError('Justification obligatoire pour un rejet', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }
      return prisma.$transaction(async tx => {
        const rows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "ThreatSubmission"
          WHERE "id" = ${args.submissionId} AND "status" = 'PENDING'::"ThreatReviewStatus"
          FOR UPDATE
        `;
        if (!rows.length) return missing();
        const submission = await tx.threatSubmission.findFirst({
          where: { id: args.submissionId, status: 'PENDING', tenant: { isActive: true } },
        });
        if (!submission) return missing();
        // Un reviseur ne peut jamais approuver sa propre soumission.
        // S'applique aussi au rejet pour garantir une separation des taches.
        if (submission.submittedById === reviewerId) return denied();
        let threatId: string | null = null;
        if (args.approve) {
          // Revalider au dernier moment et refuser tout partage d'indicateur non admis.
          const normalized = normalizeShareableIoC(submission.indicatorType, submission.indicatorValue);
          if (normalized !== submission.indicatorValue) return denied();
          const threat = await tx.sharedThreat.upsert({
            where: { indicatorType_indicatorValue: {
              indicatorType: submission.indicatorType, indicatorValue: normalized,
            } },
            create: {
              id: randomUUID(), indicatorType: submission.indicatorType,
              indicatorValue: normalized,
              title: submission.title, mitigation: submission.mitigation,
              publishedById: reviewerId,
            },
            update: {},
          });
          if (threat.revokedAt !== null) return denied();
          threatId = threat.id;
        }
        const updated = await tx.threatSubmission.update({
          where: { id: submission.id },
          data: {
            status: args.approve ? 'APPROVED' : 'REJECTED',
            reviewedById: reviewerId, reviewedAt: new Date(),
            publishedThreatId: threatId,
          },
        });
        await tx.auditLog.create({ data: {
          // Le réviseur de plateforme peut appartenir à un autre tenant.
          // Ne pas attribuer le journal du tenant source à un acteur externe.
          tenantId: submission.tenantId,
          action: args.approve ? 'APPROVE_THREAT' : 'REJECT_THREAT',
          resource: 'THREAT_SUBMISSION', resourceId: submission.id,
          metadata: { publishedThreatId: threatId, reason, platformReviewerId: reviewerId },
        } });
        return updated;
      });
    },
    linkPublishedThreatToIncident: async (
      _: unknown, args: { incidentId: string; threatId: string }, ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'DASHBOARD', 'WRITE');
      const tenantId = await requireTenantId(ctx);
      const userId = requireAuth(ctx);
      return prisma.$transaction(async tx => {
        const incident = await tx.incident.findFirst({
          where: { id: args.incidentId, tenantId, deletedAt: null }, select: { id: true },
        });
        if (!incident) return missing();
        const threat = await tx.sharedThreat.findFirst({
          where: { id: args.threatId, revokedAt: null }, select: { id: true },
        });
        if (!threat) return missing();
        await tx.incidentThreatLink.upsert({
          where: { tenantId_incidentId_threatId: {
            tenantId, incidentId: incident.id, threatId: threat.id,
          } },
          create: {
            id: randomUUID(), tenantId, incidentId: incident.id,
            threatId: threat.id, linkedById: userId,
          },
          update: {},
        });
        await tx.auditLog.create({ data: {
          tenantId, userId, incidentId: incident.id,
          resource: 'INCIDENT_THREAT_LINK', action: 'LINK_THREAT',
          resourceId: threat.id,
        } });
        return true;
      });
    },
    unlinkPublishedThreatFromIncident: async (
      _: unknown, args: { incidentId: string; threatId: string }, ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'DASHBOARD', 'WRITE');
      const tenantId = await requireTenantId(ctx);
      const userId = requireAuth(ctx);
      const deleted = await prisma.$transaction(async tx => {
        const count = await tx.incidentThreatLink.deleteMany({
          where: { tenantId, incidentId: args.incidentId, threatId: args.threatId,
            incident: { tenantId, deletedAt: null } },
        });
        if (count.count) await tx.auditLog.create({ data: {
          tenantId, userId, incidentId: args.incidentId,
          action: 'UNLINK_THREAT', resource: 'INCIDENT_THREAT_LINK',
          resourceId: args.threatId,
        } });
        return count.count;
      });
      return deleted > 0;
    },
  },
  SharedThreat: {
    publishedAt: (p: { publishedAt: Date }) => p.publishedAt.toISOString(),
  },
  ThreatSubmission: {
    createdAt: (p: { createdAt: Date }) => p.createdAt.toISOString(),
    reviewedAt: (p: { reviewedAt: Date | null }) => validTime(p.reviewedAt),
  },
  IncidentThreatAssociation: {
    createdAt: (p: { createdAt: Date }) => p.createdAt.toISOString(),
  },
};
