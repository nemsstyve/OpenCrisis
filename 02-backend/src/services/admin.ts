import bcrypt from 'bcryptjs';
import { prisma } from '../prisma';
import { USER_INCLUDE } from './auth';

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
  const passwordHash = await bcrypt.hash(data.password, 12);
  return prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone ?? null,
      company: data.company ?? null,
      site: data.site ?? null,
      ...(roleIds && roleIds.length > 0
        ? { roleAssignments: { create: roleIds.map((roleId) => ({ roleId })) } }
        : {}),
    },
    include: USER_INCLUDE,
  });
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

  return prisma.user.update({ where: { id }, data: update, include: USER_INCLUDE });
}

export async function deleteUser(id: string): Promise<boolean> {
  await prisma.user.update({ where: { id }, data: { deletedAt: new Date() } });
  return true;
}

export async function resetPassword(userId: string, newPassword: string): Promise<boolean> {
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
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
  if (!role) throw new Error('Rôle introuvable');
  if (role.isSystem) throw new Error('Les rôles système ne peuvent pas être supprimés');

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId: id } }),
    prisma.roleAssignment.deleteMany({ where: { roleId: id } }),
    prisma.role.delete({ where: { id } }),
  ]);
  return true;
}

export async function updateRolePermissions(roleId: string, permissionIds: string[]) {
  const role = await prisma.role.findFirst({ where: { id: roleId } });
  if (!role) throw new Error('Rôle introuvable');
  if (role.isSystem) throw new Error('Les permissions des rôles système ne peuvent pas être modifiées');

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
