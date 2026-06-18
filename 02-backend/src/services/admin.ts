import bcrypt from 'bcryptjs';
import { GraphQLError } from 'graphql';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { USER_INCLUDE } from './auth';
import { passwordSchema } from '../utils/validation';

// ── Garde "dernier administrateur" ──────────────────────────────────────────────
// Empêche de retirer le dernier compte capable d'administrer (ADMIN:WRITE) via
// suppression, désactivation ou retrait du rôle admin — ce qui verrouillerait
// définitivement l'administration.

const ADMIN_WRITE_VIA_ROLE = {
  some: { role: { permissions: { some: { permission: { resource: 'ADMIN', action: 'WRITE' } } } } },
} as const;

async function countOtherActiveAdmins(excludeUserId: string): Promise<number> {
  return prisma.user.count({
    where: { id: { not: excludeUserId }, deletedAt: null, isActive: true, roleAssignments: ADMIN_WRITE_VIA_ROLE },
  });
}

async function assertNotLastAdmin(userId: string): Promise<void> {
  const isAdmin =
    (await prisma.user.count({ where: { id: userId, deletedAt: null, roleAssignments: ADMIN_WRITE_VIA_ROLE } })) > 0;
  if (isAdmin && (await countOtherActiveAdmins(userId)) === 0) {
    throw new GraphQLError('Action impossible : il doit rester au moins un administrateur actif', {
      extensions: { code: 'LAST_ADMIN' },
    });
  }
}

// ── Users ──────────────────────────────────────────────────────────────────────

export async function getUsers() {
  return prisma.user.findMany({
    where: { deletedAt: null },
    include: USER_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
}

export async function createUser(
  data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
    company?: string | null;
    site?: string | null;
  },
  roleIds?: string[] | null,
) {
  // C3 — validation de la complexité du mot de passe
  const result = passwordSchema.safeParse(data.password);
  if (!result.success) {
    throw new GraphQLError(result.error.errors[0].message, {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  const passwordHash = await bcrypt.hash(data.password, 12);
  try {
    return await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone ?? null,
        company: data.company ?? null,
        site: data.site ?? null,
        mustChangePassword: true, // C3 — changement forcé au 1er login
        ...(roleIds && roleIds.length > 0
          ? { roleAssignments: { create: roleIds.map((roleId) => ({ roleId })) } }
          : {}),
      },
      include: USER_INCLUDE,
    });
  } catch (e) {
    // N4 — message lisible plutôt que l'erreur Prisma brute en cas d'email déjà utilisé
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new GraphQLError('Un compte existe déjà avec cet email', { extensions: { code: 'BAD_USER_INPUT' } });
    }
    throw e;
  }
}

export async function updateUser(
  id: string,
  data: {
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    company?: string | null;
    site?: string | null;
    isActive?: boolean | null;
  },
) {
  const update: Record<string, unknown> = {};
  if (data.firstName != null) update.firstName = data.firstName;
  if (data.lastName != null) update.lastName = data.lastName;
  if (data.phone !== undefined) update.phone = data.phone;
  if (data.company !== undefined) update.company = data.company;
  if (data.site !== undefined) update.site = data.site;
  if (data.isActive != null) update.isActive = data.isActive;

  // Ne pas désactiver le dernier administrateur actif.
  if (data.isActive === false) await assertNotLastAdmin(id);

  return prisma.user.update({ where: { id }, data: update, include: USER_INCLUDE });
}

export async function deleteUser(id: string): Promise<boolean> {
  await assertNotLastAdmin(id);
  await prisma.user.update({ where: { id }, data: { deletedAt: new Date() } });
  return true;
}

export async function resetPassword(userId: string, newPassword: string): Promise<boolean> {
  // C3 — valider la complexité et forcer le changement au prochain login
  const result = passwordSchema.safeParse(newPassword);
  if (!result.success) {
    throw new GraphQLError(result.error.errors[0].message, {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: true } });
  // N1 — révoquer les sessions de l'utilisateur dont l'admin réinitialise le mot de passe
  await prisma.refreshToken.deleteMany({ where: { userId } });
  return true;
}

// ── Role assignments ───────────────────────────────────────────────────────────

export async function assignRole(userId: string, roleId: string): Promise<boolean> {
  await prisma.roleAssignment.upsert({
    where: { userId_roleId: { userId, roleId } },
    create: { userId, roleId },
    update: {},
  });
  return true;
}

export async function removeRole(userId: string, roleId: string): Promise<boolean> {
  // Si ce rôle confère ADMIN:WRITE et que l'utilisateur perdrait tout accès
  // d'administration, s'assurer qu'il reste au moins un autre administrateur actif.
  const roleGrantsAdmin =
    (await prisma.rolePermission.count({ where: { roleId, permission: { resource: 'ADMIN', action: 'WRITE' } } })) > 0;
  if (roleGrantsAdmin) {
    const keepsAdminViaOtherRole =
      (await prisma.roleAssignment.count({
        where: {
          userId,
          roleId: { not: roleId },
          role: { permissions: { some: { permission: { resource: 'ADMIN', action: 'WRITE' } } } },
        },
      })) > 0;
    if (!keepsAdminViaOtherRole && (await countOtherActiveAdmins(userId)) === 0) {
      throw new GraphQLError('Action impossible : il doit rester au moins un administrateur actif', {
        extensions: { code: 'LAST_ADMIN' },
      });
    }
  }
  await prisma.roleAssignment.deleteMany({ where: { userId, roleId } });
  return true;
}

// ── Roles ──────────────────────────────────────────────────────────────────────

export async function getRoles() {
  return prisma.role.findMany({
    include: { permissions: { include: { permission: true } } },
    orderBy: { name: 'asc' },
  });
}

export async function getPermissions() {
  return prisma.permission.findMany({
    orderBy: [{ resource: 'asc' }, { action: 'asc' }],
  });
}

export async function createRole(data: {
  name: string;
  description?: string | null;
  permissionIds: string[];
}) {
  return prisma.role.create({
    data: {
      name: data.name,
      description: data.description ?? null,
      isSystem: false,
      permissions: {
        create: data.permissionIds.map((permissionId) => ({ permissionId })),
      },
    },
    include: { permissions: { include: { permission: true } } },
  });
}

export async function deleteRole(id: string): Promise<boolean> {
  const role = await prisma.role.findFirst({ where: { id } });
  if (!role) throw new GraphQLError('Rôle introuvable', { extensions: { code: 'NOT_FOUND' } });
  if (role.isSystem) throw new GraphQLError('Les rôles système ne peuvent pas être supprimés', { extensions: { code: 'FORBIDDEN' } });

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId: id } }),
    prisma.roleAssignment.deleteMany({ where: { roleId: id } }),
    prisma.role.delete({ where: { id } }),
  ]);
  return true;
}

export async function updateRolePermissions(roleId: string, permissionIds: string[]) {
  const role = await prisma.role.findFirst({ where: { id: roleId } });
  if (!role) throw new GraphQLError('Rôle introuvable', { extensions: { code: 'NOT_FOUND' } });
  if (role.isSystem) throw new GraphQLError('Les permissions des rôles système ne peuvent pas être modifiées', { extensions: { code: 'FORBIDDEN' } });

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    ...(permissionIds.length > 0
      ? [prisma.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
        })]
      : []),
  ]);

  return prisma.role.findFirstOrThrow({
    where: { id: roleId },
    include: { permissions: { include: { permission: true } } },
  });
}

// ── Audit Log ──────────────────────────────────────────────────────────────────

export async function getAuditLogs(opts: {
  incidentId?: string | null;
  limit?: number | null;
  offset?: number | null;
}) {
  const take = Math.min(opts.limit ?? 50, 200);
  const skip = opts.offset ?? 0;
  const where = opts.incidentId ? { incidentId: opts.incidentId } : {};

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { items, total };
}
