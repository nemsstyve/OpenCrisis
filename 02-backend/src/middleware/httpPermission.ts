import type { Request, Response } from 'express';
import type { PermissionResource, PermissionAction } from '@prisma/client';
import { prisma } from '../prisma';
import { USER_INCLUDE } from '../services/auth';

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

  const allowed = user.roleAssignments.some(ra =>
    ra.role.permissions.some(
      rp => rp.permission.resource === resource && rp.permission.action === action,
    ),
  );

  if (!allowed) {
    res.status(403).json({ error: 'Permission refusée' });
    return false;
  }

  return true;
}

export async function getUserReadableResources(userId: string): Promise<Set<PermissionResource>> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null, isActive: true },
    include: USER_INCLUDE,
  });

  const resources = new Set<PermissionResource>();
  if (!user) return resources;

  for (const ra of user.roleAssignments) {
    for (const rp of ra.role.permissions) {
      if (rp.permission.action === 'READ') {
        resources.add(rp.permission.resource);
      }
    }
  }

  return resources;
}
