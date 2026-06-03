import { GraphQLError } from 'graphql';
import type { GraphQLContext } from '../context';
import type { UserWithRoles } from '../services/auth';
import { login, logout, rotateRefreshToken, getMe, changePassword } from '../services/auth';

function flattenPermissions(user: UserWithRoles) {
  const seen = new Set<string>();
  const result: { resource: string; action: string }[] = [];
  for (const ra of user.roleAssignments) {
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
      { email, password }: { email: string; password: string },
      ctx: GraphQLContext,
    ) => {
      if (!ctx.res) {
        throw new GraphQLError('Contexte HTTP requis', { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
      }
      return login(email, password, ctx.res, ctx.req?.ip);
    },

    logout: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      if (!ctx.userId || !ctx.req || !ctx.res) return false;
      const refreshToken = ctx.req.cookies?.refreshToken as string | undefined;
      if (!refreshToken) return false;
      return logout(ctx.userId, refreshToken, ctx.res);
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
      if (!ctx.userId) {
        throw new GraphQLError('Non authentifié', { extensions: { code: 'UNAUTHENTICATED' } });
      }
      return changePassword(ctx.userId, currentPassword, newPassword, ctx.req?.ip);
    },
  },

  User: {
    roles: (parent: UserWithRoles) => parent.roleAssignments.map(ra => ra.role),
    permissions: (parent: UserWithRoles) => flattenPermissions(parent),
    mustChangePassword: (parent: UserWithRoles) => parent.mustChangePassword,
    createdAt: (parent: UserWithRoles) => parent.createdAt.toISOString(),
  },
};
