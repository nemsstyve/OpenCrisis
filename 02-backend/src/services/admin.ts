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


// Verrou transactionnel sur la ligne Tenant.
// Toutes les mutations retirant ADMIN:WRITE doivent
// utiliser ce meme verrou avant leurs controles.
async function lockTenantAdministration(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Tenant"
    WHERE "id" = ${tenantId}
      AND "isActive" = true
    FOR UPDATE
  `;

  if (rows.length !== 1) {
    throw new GraphQLError(
      'Entreprise non autorisée',
      { extensions: { code: 'FORBIDDEN' } },
    );
  }
}

async function assertTenantAdminSurvives(
  tx: Prisma.TransactionClient,
  userId: string,
  tenantId: string,
): Promise<void> {
  const target = await tx.user.findFirst({
    where: {
      id: userId,
      tenantId,
      deletedAt: null,
      isActive: true,
    },
    select: {
      id: true,
      roleAssignments: {
        select: {
          role: {
            select: {
              tenantId: true,
              isSystem: true,
              permissions: {
                select: {
                  permission: {
                    select: { resource: true, action: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!target) return;

  const isAdmin = target.roleAssignments.some(({ role }) =>
    (
      role.isSystem
        ? role.tenantId === null
        : role.tenantId === tenantId
    ) &&
    role.permissions.some(({ permission }) =>
      permission.resource === 'ADMIN' &&
      permission.action === 'WRITE'
    )
  );

  if (!isAdmin) return;

  const otherAdmins = await tx.user.count({
    where: {
      tenantId,
      id: { not: userId },
      deletedAt: null,
      isActive: true,
      roleAssignments: {
        some: {
          role: {
            OR: [
              { tenantId, isSystem: false },
              { tenantId: null, isSystem: true },
            ],
            permissions: {
              some: {
                permission: {
                  resource: 'ADMIN',
                  action: 'WRITE',
                },
              },
            },
          },
        },
      },
    },
  });

  if (otherAdmins === 0) {
    throw new GraphQLError(
      'Action impossible : dernier administrateur du tenant',
      { extensions: { code: 'LAST_ADMIN' } },
    );
  }
}

// ── Users ──────────────────────────────────────────────────────────────────────

export async function getUsers(tenantId: string) {
  return prisma.user.findMany({
    where: { tenantId, deletedAt: null },
    include: USER_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Controle transactionnel de delegation.
 *
 * Le verrou Tenant doit etre acquis avant cet appel.
 * Un administrateur ne peut transmettre que les permissions
 * qu'il possede effectivement dans son tenant.
 */
async function assertDelegationAllowed(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  tenantId: string,
  permissionIds: string[],
): Promise<void> {
  if (!actorUserId || !tenantId) {
    throw new GraphQLError('Delegation non autorisee', {
      extensions: { code: 'FORBIDDEN' },
    });
  }

  const actor = await tx.user.findFirst({
    where: {
      id: actorUserId,
      tenantId,
      deletedAt: null,
      isActive: true,
      mustChangePassword: false,
    },
    select: {
      roleAssignments: {
        select: {
          role: {
            select: {
              tenantId: true,
              isSystem: true,
              permissions: {
                select: {
                  permissionId: true,
                  permission: {
                    select: {
                      resource: true,
                      action: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!actor) {
    throw new GraphQLError('Delegation non autorisee', {
      extensions: { code: 'FORBIDDEN' },
    });
  }

  const allowed = new Set<string>();
  let canAdminister = false;

  for (const assignment of actor.roleAssignments) {
    const role = assignment.role;

    const applicable = role.isSystem
      ? role.tenantId === null
      : role.tenantId === tenantId;

    if (!applicable) continue;

    for (const entry of role.permissions) {
      allowed.add(entry.permissionId);

      if (
        entry.permission.resource === 'ADMIN' &&
        entry.permission.action === 'WRITE'
      ) {
        canAdminister = true;
      }
    }
  }

  if (!canAdminister) {
    throw new GraphQLError('Permission ADMIN:WRITE requise', {
      extensions: { code: 'FORBIDDEN' },
    });
  }

  if (permissionIds.some(id => !allowed.has(id))) {
    throw new GraphQLError(
      'Impossible de deleguer une permission non detenue',
      { extensions: { code: 'FORBIDDEN' } },
    );
  }
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
  roleIds: string[] | null | undefined,
  tenantId: string,
  actorUserId: string,
) {
  if (!tenantId || !actorUserId) {
    throw new GraphQLError('Entreprise non autorisee', {
      extensions: { code: 'FORBIDDEN' },
    });
  }

  const result = passwordSchema.safeParse(data.password);

  if (!result.success) {
    throw new GraphQLError(result.error.issues[0].message, {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  const selectedRoleIds = roleIds ?? [];
  const uniqueIds = [...new Set(selectedRoleIds)];

  if (uniqueIds.length !== selectedRoleIds.length) {
    throw new GraphQLError('Liste de roles invalide', {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  const passwordHash = await bcrypt.hash(data.password, 12);

  try {
    return await prisma.$transaction(async tx => {
      await lockTenantAdministration(tx, tenantId);

      const roles = await tx.role.findMany({
        where: {
          id: { in: uniqueIds },
          OR: [
            { tenantId, isSystem: false },
            { tenantId: null, isSystem: true },
          ],
        },
        include: {
          permissions: true,
        },
      });

      if (roles.length !== uniqueIds.length) {
        throw new GraphQLError(
          'Un ou plusieurs roles sont indisponibles',
          { extensions: { code: 'NOT_FOUND' } },
        );
      }

      const permissionIds = roles.flatMap(role =>
        role.permissions.map(item => item.permissionId)
      );

      await assertDelegationAllowed(
        tx, actorUserId, tenantId, permissionIds,
      );

      const createdUser = await tx.user.create({
        data: {
          email: data.email,
          tenantId,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone ?? null,
          company: data.company ?? null,
          site: data.site ?? null,
          mustChangePassword: true,
          ...(uniqueIds.length > 0
            ? {
                roleAssignments: {
                  create: uniqueIds.map(roleId => ({ roleId })),
                },
              }
            : {}),
        },
        include: USER_INCLUDE,
      });

      // Audit atomique avec la creation utilisateur.
      // Si l'audit echoue, PostgreSQL annule aussi
      // la creation et les attributions initiales.
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actorUserId,
          action: 'CREATE',
          resource: 'ADMIN',
          resourceId: createdUser.id,
          metadata: {
            target: 'user',
            email: data.email,
          },
        },
      });

      return createdUser;
    }, { maxWait: 10000, timeout: 15000 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new GraphQLError(
        'Un compte existe deja avec cet email',
        { extensions: { code: 'BAD_USER_INPUT' } },
      );
    }

    throw error;
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
  tenantId: string,
  actorUserId: string,
) {
  if (!tenantId) {
    throw new GraphQLError('Entreprise non autorisée', {
      extensions: { code: 'FORBIDDEN' },
    });
  }

  const update: Record<string, unknown> = {};
  if (data.firstName != null) update.firstName = data.firstName;
  if (data.lastName != null) update.lastName = data.lastName;
  if (data.phone !== undefined) update.phone = data.phone;
  if (data.company !== undefined) update.company = data.company;
  if (data.site !== undefined) update.site = data.site;
  if (data.isActive != null) update.isActive = data.isActive;

  return prisma.$transaction(async tx => {
    await lockTenantAdministration(tx, tenantId);

    // Reautorisation transactionnelle apres acquisition du verrou.
    await assertDelegationAllowed(
      tx, actorUserId, tenantId, [],
    );

    const target = await tx.user.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });

    if (!target) {
      throw new GraphQLError('Utilisateur introuvable', {
        extensions: { code: 'NOT_FOUND' },
      });
    }

    const user = await tx.user.update({
      where: { id, tenantId, deletedAt: null },
      data: {
        ...update,
        ...(data.isActive === false
          ? { sessionVersion: { increment: 1 } }
          : {}),
      },
      include: USER_INCLUDE,
    });

    if (data.isActive === false) {
      await tx.refreshToken.deleteMany({
        where: { userId: id },
      });
    }

    if (data.isActive === false) {
      await assertTenantHasActiveAdmin(tx, tenantId);
    }

    // Audit dans la meme transaction que la modification.
    // Une erreur d'audit annule aussi toute desactivation,
    // increment de sessionVersion et suppression des refresh tokens.
    await tx.auditLog.create({
      data: {
        tenantId,
        userId: actorUserId,
        action: 'UPDATE',
        resource: 'ADMIN',
        resourceId: id,
        metadata: {
          target: 'user',
          deactivated: data.isActive === false,
        },
      },
    });

    return user;
  });
}

export async function deleteUser(
  id: string,
  tenantId: string,
  actorUserId: string,
): Promise<boolean> {
  if (!tenantId) {
    throw new GraphQLError('Entreprise non autorisée', {
      extensions: { code: 'FORBIDDEN' },
    });
  }

  await prisma.$transaction(async tx => {
    await lockTenantAdministration(tx, tenantId);

    // Reautorisation transactionnelle apres acquisition du verrou.
    await assertDelegationAllowed(
      tx, actorUserId, tenantId, [],
    );

    const target = await tx.user.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });

    if (!target) {
      throw new GraphQLError('Utilisateur introuvable', {
        extensions: { code: 'NOT_FOUND' },
      });
    }

    await tx.user.update({
      where: { id, tenantId, deletedAt: null },
      data: {
        deletedAt: new Date(),
        sessionVersion: { increment: 1 },
      },
    });

    await tx.refreshToken.deleteMany({
      where: { userId: id },
    });

    await assertTenantHasActiveAdmin(tx, tenantId);

    // Audit atomique avec la suppression logique.
    // Une erreur d'audit annule aussi la suppression,
    // la revocation des sessions et des refresh tokens.
    await tx.auditLog.create({
      data: {
        tenantId,
        userId: actorUserId,
        action: 'DELETE',
        resource: 'ADMIN',
        resourceId: id,
        metadata: {
          target: 'user',
        },
      },
    });
  });

  return true;
}

export async function resetPassword(
  userId: string,
  newPassword: string,
  tenantId: string,
  actorUserId: string,
): Promise<boolean> {
  if (!tenantId) {
    throw new GraphQLError('Entreprise non autorisée', {
      extensions: { code: 'FORBIDDEN' },
    });
  }

  const result = passwordSchema.safeParse(newPassword);
  if (!result.success) {
    throw new GraphQLError(result.error.issues[0].message, {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.$transaction(async tx => {
    await lockTenantAdministration(tx, tenantId);

    // Reautorisation transactionnelle apres acquisition du verrou.
    await assertDelegationAllowed(
      tx, actorUserId, tenantId, [],
    );

    // Interdire la prise de controle des comptes privilegies.
    // La verification est faite apres verrouillage du tenant,
    // dans la transaction qui modifiera le mot de passe.
    const target = await tx.user.findFirst({
      where: {
        id: userId,
        tenantId,
        deletedAt: null,
      },
      select: {
        roleAssignments: {
          select: {
            role: {
              select: {
                tenantId: true,
                isSystem: true,
                permissions: {
                  select: {
                    permissionId: true,
                    permission: {
                      select: {
                        resource: true,
                        action: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!target) {
      throw new GraphQLError('Utilisateur introuvable', {
        extensions: { code: 'NOT_FOUND' },
      });
    }

    const targetPermissionIds = new Set<string>();
    let targetIsAdministrator = false;

    for (const assignment of target.roleAssignments) {
      const role = assignment.role;

      const applicable = role.isSystem
        ? role.tenantId === null
        : role.tenantId === tenantId;

      if (!applicable) continue;

      for (const entry of role.permissions) {
        targetPermissionIds.add(entry.permissionId);

        if (
          entry.permission.resource === 'ADMIN' &&
          entry.permission.action === 'WRITE'
        ) {
          targetIsAdministrator = true;
        }
      }
    }

    // Sans permission distincte de recuperation de comptes
    // administrateurs, aucun reset administratif d'un compte
    // detenant ADMIN:WRITE n'est autorise.
    if (targetIsAdministrator) {
      throw new GraphQLError(
        'Reinitialisation de compte administrateur interdite',
        { extensions: { code: 'FORBIDDEN' } },
      );
    }

    // Le compte cible ne peut pas avoir plus de permissions
    // que l'administrateur qui effectue la reinitialisation.
    await assertDelegationAllowed(
      tx,
      actorUserId,
      tenantId,
      [...targetPermissionIds],
    );

    const updated = await tx.user.updateMany({
      where: { id: userId, tenantId, deletedAt: null },
      data: {
        passwordHash,
        mustChangePassword: true,
        sessionVersion: { increment: 1 },
      },
    });

    if (updated.count !== 1) {
      throw new GraphQLError('Utilisateur introuvable', {
        extensions: { code: 'NOT_FOUND' },
      });
    }

    await tx.refreshToken.deleteMany({
      where: { userId },
    });

    // La reinitialisation impose un changement de mot
    // de passe : le compte ne peut plus exercer ADMIN:WRITE.
    // Refuser l'operation si aucun autre administrateur
    // operationnel ne subsiste dans cette entreprise.
    await assertTenantHasActiveAdmin(tx, tenantId);

    // Audit dans la transaction du changement de mot de passe.
    // Aucun secret ni hash ne doit figurer dans l'audit.
    // Un echec d'audit annule aussi la modification du mot
    // de passe et la revocation des sessions.
    await tx.auditLog.create({
      data: {
        tenantId,
        userId: actorUserId,
        action: 'UPDATE',
        resource: 'ADMIN',
        resourceId: userId,
        metadata: {
          target: 'password_reset',
        },
      },
    });
  });

  return true;
}

// ── Role assignments ───────────────────────────────────────────────────────────

export async function assignRole(
  userId: string,
  roleId: string,
  tenantId: string,
  actorUserId: string,
): Promise<boolean> {
  if (!tenantId || !actorUserId) {
    throw new GraphQLError('Entreprise non autorisee', {
      extensions: { code: 'FORBIDDEN' },
    });
  }

  return prisma.$transaction(async tx => {
    await lockTenantAdministration(tx, tenantId);

    const user = await tx.user.findFirst({
      where: {
        id: userId,
        tenantId,
        deletedAt: null,
        isActive: true,
      },
      select: { id: true },
    });

    const role = await tx.role.findFirst({
      where: {
        id: roleId,
        OR: [
          { tenantId, isSystem: false },
          { tenantId: null, isSystem: true },
        ],
      },
      include: {
        permissions: true,
      },
    });

    if (!user || !role) {
      throw new GraphQLError(
        'Utilisateur ou role introuvable',
        { extensions: { code: 'NOT_FOUND' } },
      );
    }

    await assertDelegationAllowed(
      tx,
      actorUserId,
      tenantId,
      role.permissions.map(item => item.permissionId),
    );

    await tx.roleAssignment.upsert({
      where: { userId_roleId: { userId, roleId } },
      create: { userId, roleId },
      update: {},
    });

    // Audit durable dans la MEME transaction Prisma.
    // Si cet INSERT echoue, l'attribution du role
    // est annulee par PostgreSQL.
    await tx.auditLog.create({
      data: {
        tenantId,
        userId: actorUserId,
        action: 'UPDATE',
        resource: 'ADMIN',
        resourceId: userId,
        metadata: {
          target: 'role_assign',
          roleId,
        },
      },
    });

    return true;
  }, { maxWait: 10000, timeout: 15000 });
}

export async function removeRole(
  userId: string,
  roleId: string,
  tenantId: string,
  actorUserId: string,
): Promise<boolean> {
  if (!tenantId) {
    throw new GraphQLError('Entreprise non autorisée', {
      extensions: { code: 'FORBIDDEN' },
    });
  }

  await prisma.$transaction(async tx => {
    await lockTenantAdministration(tx, tenantId);

    // Reautorisation transactionnelle apres acquisition du verrou.
    await assertDelegationAllowed(
      tx, actorUserId, tenantId, [],
    );

    const [user, role] = await Promise.all([
      tx.user.findFirst({
        where: {
          id: userId,
          tenantId,
          deletedAt: null,
        },
        select: { id: true },
      }),
      tx.role.findFirst({
        where: {
          id: roleId,
          OR: [
            { tenantId, isSystem: false },
            { tenantId: null, isSystem: true },
          ],
        },
        select: { id: true },
      }),
    ]);

    if (!user || !role) {
      throw new GraphQLError(
        'Utilisateur ou rôle introuvable',
        { extensions: { code: 'NOT_FOUND' } },
      );
    }

    const removed = await tx.roleAssignment.deleteMany({
      where: { userId, roleId },
    });

    if (removed.count !== 1) {
      throw new GraphQLError(
        'Attribution de rôle introuvable',
        { extensions: { code: 'NOT_FOUND' } },
      );
    }

    await assertTenantHasActiveAdmin(tx, tenantId);

    // L'audit fait partie de la transaction du retrait.
    // Si son insertion echoue, PostgreSQL restaure
    // l'attribution du role.
    await tx.auditLog.create({
      data: {
        tenantId,
        userId: actorUserId,
        action: 'UPDATE',
        resource: 'ADMIN',
        resourceId: userId,
        metadata: {
          target: 'role_remove',
          roleId,
        },
      },
    });
  });

  return true;
}


// Controle l'absence d'attributions incoherentes.
// Une mutation sur un role personnalise ne doit pas
// affecter silencieusement des utilisateurs externes.
async function assertRoleAssignmentsLocal(
  tx: Prisma.TransactionClient,
  roleId: string,
  tenantId: string,
): Promise<void> {
  const foreignAssignments = await tx.roleAssignment.count({
    where: {
      roleId,
      user: {
        OR: [
          { tenantId: { not: tenantId } },
          { tenantId: null },
        ],
      },
    },
  });

  if (foreignAssignments !== 0) {
    throw new GraphQLError(
      'Attributions de role incoherentes',
      { extensions: { code: 'FORBIDDEN' } },
    );
  }
}

// Invariant : chaque tenant doit conserver
// au moins un administrateur actif.
async function assertTenantHasActiveAdmin(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<void> {
  const count = await tx.user.count({
    where: {
      tenantId,
      isActive: true,
      deletedAt: null,
      mustChangePassword: false,
      roleAssignments: {
        some: {
          role: {
            OR: [
              { tenantId, isSystem: false },
              { tenantId: null, isSystem: true },
            ],
            permissions: {
              some: {
                permission: {
                  resource: 'ADMIN',
                  action: 'WRITE',
                },
              },
            },
          },
        },
      },
    },
  });

  if (count < 1) {
    throw new GraphQLError(
      'Action impossible : dernier administrateur du tenant',
      { extensions: { code: 'LAST_ADMIN' } },
    );
  }
}

// ── Roles ──────────────────────────────────────────────────────────────────────

export async function getRoles(tenantId: string) {
  return prisma.role.findMany({
    where: {
      OR: [
        { tenantId, isSystem: false },
        { tenantId: null, isSystem: true },
      ],
    },
    include: { permissions: { include: { permission: true } } },
    orderBy: { name: 'asc' },
  });
}

export async function getPermissions() {
  return prisma.permission.findMany({
    orderBy: [{ resource: 'asc' }, { action: 'asc' }],
  });
}

export async function createRole(
  data: {
    name: string;
    description?: string | null;
    permissionIds: string[];
  },
  tenantId: string,
  actorUserId: string,
) {
  if (!tenantId || !actorUserId) {
    throw new GraphQLError('Entreprise non autorisee', {
      extensions: { code: 'FORBIDDEN' },
    });
  }

  const uniqueIds = [...new Set(data.permissionIds)];

  if (uniqueIds.length !== data.permissionIds.length) {
    throw new GraphQLError('Liste de permissions invalide', {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  return prisma.$transaction(async tx => {
    await lockTenantAdministration(tx, tenantId);

    if (uniqueIds.length > 0) {
      const validCount = await tx.permission.count({
        where: { id: { in: uniqueIds } },
      });

      if (validCount !== uniqueIds.length) {
        throw new GraphQLError('Permission introuvable', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }
    }

    await assertDelegationAllowed(
      tx, actorUserId, tenantId, uniqueIds,
    );

    const createdRole = await tx.role.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        tenantId,
        isSystem: false,
        permissions: {
          create: uniqueIds.map(permissionId => ({
            permissionId,
          })),
        },
      },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });

    // Audit atomique avec le role et ses permissions.
    // Un echec de l'audit annule la creation du role.
    await tx.auditLog.create({
      data: {
        tenantId,
        userId: actorUserId,
        action: 'CREATE',
        resource: 'ADMIN',
        resourceId: createdRole.id,
        metadata: {
          target: 'role',
          name: data.name,
        },
      },
    });

    return createdRole;
  }, { maxWait: 10000, timeout: 15000 });
}

export async function deleteRole(
  id: string,
  tenantId: string,
  actorUserId: string,
): Promise<boolean> {
  if (!tenantId) {
    throw new GraphQLError('Entreprise non autorisée', {
      extensions: { code: 'FORBIDDEN' },
    });
  }

  await prisma.$transaction(async tx => {
    await lockTenantAdministration(tx, tenantId);

    // Reautorisation transactionnelle apres acquisition du verrou.
    await assertDelegationAllowed(
      tx, actorUserId, tenantId, [],
    );

    const role = await tx.role.findFirst({
      where: { id, tenantId, isSystem: false },
      select: { id: true },
    });

    if (!role) {
      throw new GraphQLError(
        'Role introuvable ou non modifiable',
        { extensions: { code: 'NOT_FOUND' } },
      );
    }

    await assertRoleAssignmentsLocal(tx, id, tenantId);

    await tx.rolePermission.deleteMany({
      where: { roleId: id },
    });

    await tx.roleAssignment.deleteMany({
      where: { roleId: id },
    });

    await tx.role.delete({
      where: { id, tenantId, isSystem: false },
    });

    await assertTenantHasActiveAdmin(tx, tenantId);

    // Audit atomique avec la suppression du role.
    // Un echec de l'audit annule la suppression du role,
    // de ses permissions et de ses attributions.
    await tx.auditLog.create({
      data: {
        tenantId,
        userId: actorUserId,
        action: 'DELETE',
        resource: 'ADMIN',
        resourceId: id,
        metadata: {
          target: 'role',
        },
      },
    });
  }, { maxWait: 10000, timeout: 15000 });

  return true;
}

export async function updateRolePermissions(
  roleId: string,
  permissionIds: string[],
  tenantId: string,
  actorUserId: string,
) {
  if (!tenantId) {
    throw new GraphQLError('Entreprise non autorisée', {
      extensions: { code: 'FORBIDDEN' },
    });
  }

  const uniqueIds = [...new Set(permissionIds)];

  if (uniqueIds.length !== permissionIds.length) {
    throw new GraphQLError(
      'Liste de permissions invalide',
      { extensions: { code: 'BAD_USER_INPUT' } },
    );
  }

  return prisma.$transaction(async tx => {
    await lockTenantAdministration(tx, tenantId);

    await assertDelegationAllowed(
      tx, actorUserId, tenantId, uniqueIds,
    );

    const role = await tx.role.findFirst({
      where: {
        id: roleId,
        tenantId,
        isSystem: false,
      },
      select: { id: true },
    });

    if (!role) {
      throw new GraphQLError(
        'Role introuvable ou non modifiable',
        { extensions: { code: 'NOT_FOUND' } },
      );
    }

    await assertRoleAssignmentsLocal(tx, roleId, tenantId);

    if (uniqueIds.length > 0) {
      const validCount = await tx.permission.count({
        where: { id: { in: uniqueIds } },
      });

      if (validCount !== uniqueIds.length) {
        throw new GraphQLError(
          'Permission introuvable',
          { extensions: { code: 'BAD_USER_INPUT' } },
        );
      }
    }

    await tx.rolePermission.deleteMany({
      where: { roleId },
    });

    if (uniqueIds.length > 0) {
      await tx.rolePermission.createMany({
        data: uniqueIds.map(permissionId => ({
          roleId,
          permissionId,
        })),
      });
    }

    await assertTenantHasActiveAdmin(tx, tenantId);

    const updatedRole = await tx.role.findFirstOrThrow({
      where: { id: roleId, tenantId, isSystem: false },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });

    // Audit persistant dans la transaction RBAC.
    // Si l'insertion echoue, les anciennes permissions
    // sont restaurees par PostgreSQL.
    await tx.auditLog.create({
      data: {
        tenantId,
        userId: actorUserId,
        action: 'UPDATE',
        resource: 'ADMIN',
        resourceId: roleId,
        metadata: {
          target: 'role_permissions',
          count: permissionIds.length,
        },
      },
    });

    return updatedRole;
  }, { maxWait: 10000, timeout: 15000 });
}

export async function getAuditLogs(tenantId: string, opts: {
  incidentId?: string | null;
  limit?: number | null;
  offset?: number | null;
}) {
  const take = Math.min(opts.limit ?? 50, 200);
  const skip = opts.offset ?? 0;
  const where = {
    tenantId,
    ...(opts.incidentId
      ? { incidentId: opts.incidentId }
      : {}),
  };

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
