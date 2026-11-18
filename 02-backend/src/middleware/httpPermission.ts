import type { Request, Response } from 'express';
import type { PermissionResource, PermissionAction } from '@prisma/client';
import { prisma } from '../prisma';
import { USER_INCLUDE } from '../services/auth';
import { requireTenantId } from './tenant';

export type AuthRequest = Request & { userId: string };

export async function requireHttpPermission(
  req: AuthRequest,
  res: Response,
  resource: PermissionResource,
  action: PermissionAction,
): Promise<boolean> {
  const user = await prisma.user.findFirst({
    where: { id: req.userId, deletedAt: null, isActive: true },
    include: USER_INCLUDE,
  });

  if (!user) {
    res.status(401).json({ error: 'Non authentifié' });
    return false;
  }

  // Mot de passe temporaire non changé : aucune opération REST gardée autorisée.
  if (user.mustChangePassword) {
    res.status(403).json({ error: 'Changement de mot de passe requis' });
    return false;
  }

  // Deriver l'entreprise active depuis la base,
  // jamais depuis les parametres du client.
  let tenantId: string;
  try {
    tenantId = await requireTenantId({
      userId: req.userId,
      req,
      res,
    });
  } catch {
    res.status(403).json({
      error: 'Entreprise non autorisée',
    });
    return false;
  }

  const allowed = user.roleAssignments.some(ra =>
    (
      ra.role.isSystem
        ? ra.role.tenantId === null
        : ra.role.tenantId === tenantId
    ) &&
    ra.role.permissions.some(
      rp => rp.permission.resource === resource &&
        rp.permission.action === action,
    ),
  );

  if (!allowed) {
    res.status(403).json({ error: 'Permission refusée' });
    return false;
  }

  return true;
}

/**
 * True si l'utilisateur doit encore changer son mot de passe temporaire.
 * Les routes REST hors requireHttpPermission (ex. exports) l'utilisent pour
 * refuser toute opération gardée, en cohérence avec requirePermission/requireHttpPermission.
 */
export async function passwordChangeRequired(userId: string): Promise<boolean> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null, isActive: true },
    select: { mustChangePassword: true },
  });
  return user?.mustChangePassword ?? false;
}

export async function getUserReadableResources(userId: string): Promise<Set<PermissionResource>> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null, isActive: true },
    include: USER_INCLUDE,
  });

  const resources = new Set<PermissionResource>();

  // Aucun droit exportable si le compte n'est pas
  // actif ou si le mot de passe doit etre change.
  if (!user || user.mustChangePassword) {
    return resources;
  }

  let tenantId: string;

  try {
    tenantId = await requireTenantId({
      userId,
      req: null,
      res: null,
    });
  } catch {
    // Echec ferme : entreprise absente ou inactive.
    return resources;
  }

  for (const ra of user.roleAssignments) {
    const roleAllowed = ra.role.isSystem
      ? ra.role.tenantId === null
      : ra.role.tenantId === tenantId;

    if (!roleAllowed) continue;

    for (const rp of ra.role.permissions) {
      if (rp.permission.action === 'READ') {
        resources.add(rp.permission.resource);
      }
    }
  }

  return resources;
}
