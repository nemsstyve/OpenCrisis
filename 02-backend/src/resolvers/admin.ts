import { GraphQLError } from 'graphql';
import type { GraphQLContext } from '../context';
import { requirePermission } from '../middleware/rbac';
import { logAudit } from '../middleware/audit';
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
      const deleted = await adminService.deleteUser(id);
      logAudit({ userId: ctx.userId, action: 'DELETE', resource: 'ADMIN', resourceId: id, metadata: { target: 'user' } });
      return deleted;
    },

    adminAssignRole: async (
      _: unknown,
      { userId, roleId }: { userId: string; roleId: string },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'ADMIN', 'WRITE');
      const assigned = await adminService.assignRole(userId, roleId);
      logAudit({ userId: ctx.userId, action: 'UPDATE', resource: 'ADMIN', resourceId: userId, metadata: { target: 'role_assign', roleId } });
      return assigned;
    },

    adminRemoveRole: async (
      _: unknown,
      { userId, roleId }: { userId: string; roleId: string },
      ctx: GraphQLContext,
    ) => {
      await requirePermission(ctx, 'ADMIN', 'WRITE');
      const removed = await adminService.removeRole(userId, roleId);
      logAudit({ userId: ctx.userId, action: 'UPDATE', resource: 'ADMIN', resourceId: userId, metadata: { target: 'role_remove', roleId } });
      return removed;
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
      const deletedRole = await adminService.deleteRole(id);
      logAudit({ userId: ctx.userId, action: 'DELETE', resource: 'ADMIN', resourceId: id, metadata: { target: 'role' } });
      return deletedRole;
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
      const reset = await adminService.resetPassword(userId, newPassword);
      logAudit({ userId: ctx.userId, action: 'UPDATE', resource: 'ADMIN', resourceId: userId, metadata: { target: 'password_reset' } });
      return reset;
    },
  },

};
// Note: User field resolvers (roles, permissions, createdAt) are handled
// by authResolvers.User and apply globally to all User objects in the schema.
