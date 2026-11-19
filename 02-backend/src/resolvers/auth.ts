import { GraphQLError } from 'graphql';
import type { GraphQLContext } from '../context';
import type { UserWithRoles } from '../services/auth';
import { requireAuth } from '../middleware/rbac';
import { login, logout, rotateRefreshToken, getMe, changePassword } from '../services/auth';
import {
  beginTotpEnrollment,
  enableTotp,
  disableTotp,
} from '../services/totpAccount';

function flattenPermissions(user: UserWithRoles) {
  const seen = new Set<string>();
  const result: { resource: string; action: string }[] = [];
  for (const ra of user.roleAssignments ?? []) {
    for (const rp of ra.role.permissions) {
      const key = `${rp.permission.resource}:${rp.permission.action}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ resource: rp.permission.resource, action: rp.permission.action });
      }
    }
  }
  return result;
}

export const authResolvers = {
  Query: {
    me: (_: unknown, __: unknown, ctx: GraphQLContext) => {
      if (!ctx.userId) return null;
      return getMe(ctx.userId);
    },
  },

  Mutation: {
    login: async (
      _: unknown,
      { email, password, totpCode }: { email: string; password: string; totpCode?: string },
      ctx: GraphQLContext,
    ) => {
      if (!ctx.res) {
        throw new GraphQLError('Contexte HTTP requis', { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
      }
      return login(email, password, ctx.res, ctx.req?.ip, totpCode);
    },

    beginTotpEnrollment: (
      _: unknown,
      args: { password: string },
      ctx: GraphQLContext,
    ) => beginTotpEnrollment(requireAuth(ctx), args.password),

    enableTotp: (
      _: unknown,
      args: { code: string },
      ctx: GraphQLContext,
    ) => enableTotp(requireAuth(ctx), args.code),

    disableTotp: (
      _: unknown,
      args: { password: string; code: string },
      ctx: GraphQLContext,
    ) => disableTotp(requireAuth(ctx), args.password, args.code),

    logout: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      if (!ctx.userId || !ctx.sessionId || !ctx.req || !ctx.res) {
        return false;
      }
      return logout(ctx.userId, ctx.sessionId, ctx.res);
    },

    refreshToken: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      if (!ctx.req || !ctx.res) {
        throw new GraphQLError('Contexte HTTP requis', { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
      }
      const token = ctx.req.cookies?.refreshToken as string | undefined;
      if (!token) {
        throw new GraphQLError('Aucun token de renouvellement', { extensions: { code: 'UNAUTHENTICATED' } });
      }
      return rotateRefreshToken(token, ctx.res);
    },

    changePassword: async (
      _: unknown,
      { currentPassword, newPassword }: { currentPassword: string; newPassword: string },
      ctx: GraphQLContext,
    ) => {
      if (!ctx.res) {
        throw new GraphQLError('Contexte HTTP requis', { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
      }
      const userId = requireAuth(ctx);
      return changePassword(userId, currentPassword, newPassword, ctx.req?.ip, ctx.res);
    },
  },

  User: {
    // N3 — les User imbriqués (createdBy, author, actor…) sont chargés sans
    // roleAssignments : rester défensif pour ne pas crasher si roles/permissions est demandé.
    roles: (parent: UserWithRoles) => (parent.roleAssignments ?? []).map(ra => ra.role),
    permissions: (parent: UserWithRoles) => flattenPermissions(parent),
    mustChangePassword: (parent: UserWithRoles) => parent.mustChangePassword,
    createdAt: (parent: UserWithRoles) => parent.createdAt.toISOString(),
  },
};
