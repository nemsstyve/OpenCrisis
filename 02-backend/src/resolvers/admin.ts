import { GraphQLError } from 'graphql';
import type { GraphQLContext } from '../context';
import { requirePermission } from '../middleware/rbac';
import { logAudit } from '../middleware/audit';
import type { UserWithRoles } from '../services/auth';
import * as adminService from '../services/admin';

// ── Helpers ────────────────────────────────────────────────────────────────────

type RoleRow = Awaited<ReturnType<typeof adminService.getRoles>>[number];

function mapRoleDetail(role: RoleRow) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissions: role.permissions.map((rp) => rp.permission),
  };
}

// Shared User field resolvers (reused from auth resolvers)
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

// ── Resolvers ─────────────────────────────────────────────────────────────────

export const adminResolvers = {
  Query: {
    adminUsers: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      await requirePermission(ctx, 'ADMIN', 'READ');
      return adminService.getUsers();
    },

    adminRoles: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      await requirePermission(ctx, 'ADMIN', 'READ');
      const roles = await adminService.getRoles();
      return roles.map(mapRoleDetail);
    },

    adminPermissions: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      await requirePermission(ctx, 'ADMIN', 'READ');
      return adminService.getPermissions();
    },

    adminAuditLogs: async (
      _: unknown,
      args: { incidentId?: string; limit?: number; offset?: number },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'ADMIN', 'READ');
      const { items, total } = await adminService.getAuditLogs(args);
      return {
        total,
        items: items.map((log) => ({
          ...log,
          createdAt: log.createdAt.toISOString(),
          metadata: log.metadata != null ? JSON.stringify(log.metadata) : null,
        })),
      };
    },
  },

  Mutation: {
    adminCreateUser: async (
      _: unknown,
      { input, roleIds }: { input: Parameters<typeof adminService.createUser>[0]; roleIds?: string[] },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'ADMIN', 'WRITE');
      const user = await adminService.createUser(input, roleIds);
      logAudit({ userId: ctx.userId, action: 'CREATE', resource: 'ADMIN', resourceId: user.id, metadata: { target: 'user', email: input.email } });
      return user;
    },

    adminUpdateUser: async (
      _: unknown,
      { id, input }: { id: string; input: Parameters<typeof adminService.updateUser>[1] },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'ADMIN', 'WRITE');
      if (id === ctx.userId) {
        throw new GraphQLError('Vous ne pouvez pas modifier votre propre compte via l\'administration', {
          extensions: { code: 'FORBIDDEN' },
        });
      }
      const user = await adminService.updateUser(id, input);
      logAudit({ userId: ctx.userId, action: 'UPDATE', resource: 'ADMIN', resourceId: id, metadata: { target: 'user' } });
      return user;
    },

    adminDeleteUser: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      await requirePermission(ctx, 'ADMIN', 'WRITE');
      if (id === ctx.userId) {
        throw new GraphQLError('Vous ne pouvez pas supprimer votre propre compte', {
          extensions: { code: 'FORBIDDEN' },
        });
      }
      logAudit({ userId: ctx.userId, action: 'DELETE', resource: 'ADMIN', resourceId: id, metadata: { target: 'user' } });
      return adminService.deleteUser(id);
    },

    adminAssignRole: async (
      _: unknown,
      { userId, roleId }: { userId: string; roleId: string },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'ADMIN', 'WRITE');
      logAudit({ userId: ctx.userId, action: 'UPDATE', resource: 'ADMIN', resourceId: userId, metadata: { target: 'role_assign', roleId } });
      return adminService.assignRole(userId, roleId);
    },

    adminRemoveRole: async (
      _: unknown,
      { userId, roleId }: { userId: string; roleId: string },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'ADMIN', 'WRITE');
      logAudit({ userId: ctx.userId, action: 'UPDATE', resource: 'ADMIN', resourceId: userId, metadata: { target: 'role_remove', roleId } });
      return adminService.removeRole(userId, roleId);
    },

    adminCreateRole: async (
      _: unknown,
      { input }: { input: Parameters<typeof adminService.createRole>[0] },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'ADMIN', 'WRITE');
      const role = await adminService.createRole(input);
      logAudit({ userId: ctx.userId, action: 'CREATE', resource: 'ADMIN', resourceId: role.id, metadata: { target: 'role', name: input.name } });
      return mapRoleDetail(role);
    },

    adminDeleteRole: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      await requirePermission(ctx, 'ADMIN', 'WRITE');
      logAudit({ userId: ctx.userId, action: 'DELETE', resource: 'ADMIN', resourceId: id, metadata: { target: 'role' } });
      return adminService.deleteRole(id);
    },

    adminUpdateRolePermissions: async (
      _: unknown,
      { roleId, permissionIds }: { roleId: string; permissionIds: string[] },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'ADMIN', 'WRITE');
      const role = await adminService.updateRolePermissions(roleId, permissionIds);
      logAudit({ userId: ctx.userId, action: 'UPDATE', resource: 'ADMIN', resourceId: roleId, metadata: { target: 'role_permissions', count: permissionIds.length } });
      return mapRoleDetail(role);
    },

    adminResetPassword: async (
      _: unknown,
      { userId, newPassword }: { userId: string; newPassword: string },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'ADMIN', 'WRITE');
      logAudit({ userId: ctx.userId, action: 'UPDATE', resource: 'ADMIN', resourceId: userId, metadata: { target: 'password_reset' } });
      return adminService.resetPassword(userId, newPassword);
    },
  },

  // User field resolvers needed for admin queries (same as auth resolvers)
  // These are registered at the top level and apply to all User objects
};

// Exported separately so they can be merged
export const adminUserResolvers = {
  roles: (parent: UserWithRoles) => parent.roleAssignments.map((ra) => ra.role),
  permissions: (parent: UserWithRoles) => flattenPermissions(parent),
  createdAt: (parent: UserWithRoles) => parent.createdAt.toISOString(),
};
