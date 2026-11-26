/**
 * Provisionnement Prisma du tenant Deteris-R2D Lab.
 *
 * AUCUN client Prisma instancie.
 * AUCUN point d'entree CLI.
 * AUCUN acces reseau automatique.
 *
 * L'appelant doit injecter un adaptateur et autoriser
 * explicitement l'operation. Ne pas raccorder a la
 * production avant validation de l'administration,
 * de l'audit et des tests PostgreSQL isoles.
 */

import {
  LAB_IDENTITY,
  LabProvisioningError,
} from './deteris-lab-provisioning-plan.mjs';

import {
  validateLiveInventory,
} from './deteris-lab-live-preflight.mjs';

function refuse(code) {
  throw new LabProvisioningError(code);
}

export async function provisionInactiveLabTenant(
  adapter,
  { permit = false } = {},
) {
  // Garde-fou applicatif, pas une frontiere de securite :
  // tout appelant autorise a executer ce module peut
  // techniquement fournir permit=true.
  if (permit !== true) {
    refuse('DATABASE_MUTATION_NOT_AUTHORIZED');
  }

  if (
    !adapter ||
    typeof adapter.$transaction !== 'function'
  ) {
    refuse('INVALID_PRISMA_ADAPTER');
  }

  // Pas de retry implicite en cas de conflit, panne ou
  // erreur de serialisation.
  return adapter.$transaction(
    async tx => {
      const tenantCount = await tx.tenant.count();

      if (
        !Number.isSafeInteger(tenantCount) ||
        tenantCount < 1 ||
        tenantCount > 2000
      ) {
        refuse('INVALID_TENANT_COUNT');
      }

      const tenants = await tx.tenant.findMany({
        select: {
          slug: true,
          isActive: true,
        },
        orderBy: { slug: 'asc' },
        take: 2001,
      });

      if (
        !Array.isArray(tenants) ||
        tenants.length !== tenantCount
      ) {
        refuse('INCOMPLETE_TENANT_INVENTORY');
      }

      const roles = await tx.role.findMany({
        where: {
          name: 'Administrateur',
          isSystem: true,
          tenantId: null,
        },
        select: {
          name: true,
          isSystem: true,
          tenantId: true,
          permissions: {
            select: {
              permission: {
                select: {
                  resource: true,
                  action: true,
                },
              },
            },
          },
        },
      });

      const administratorRoles = roles.map(role => ({
        name: role.name,
        isSystem: role.isSystem,
        tenantId: role.tenantId,
        canAdminWrite: role.permissions.some(
          entry =>
            entry.permission.resource === 'ADMIN' &&
            entry.permission.action === 'WRITE'
        ),
        canDashboardWrite: role.permissions.some(
          entry =>
            entry.permission.resource === 'DASHBOARD' &&
            entry.permission.action === 'WRITE'
        ),
      }));

      const adminWritePermissions =
        await tx.permission.count({
          where: {
            resource: 'ADMIN',
            action: 'WRITE',
          },
        });

      const dashboardWritePermissions =
        await tx.permission.count({
          where: {
            resource: 'DASHBOARD',
            action: 'WRITE',
          },
        });

      const plan = validateLiveInventory({
        tenants,
        administratorRoles,
        adminWritePermissions,
        dashboardWritePermissions,
      });

      if (
        plan.executionAllowed !== false ||
        plan.operation !== 'CREATE_INACTIVE_LAB_TENANT'
      ) {
        refuse('UNEXPECTED_PROVISIONING_PLAN');
      }

      // Unique mutation permise par ce module :
      // creer un tenant INACTIF, sans utilisateur,
      // connecteur, incident ou modification du tenant
      // initial.
      const created = await tx.tenant.create({
        data: {
          name: LAB_IDENTITY.name,
          slug: LAB_IDENTITY.slug,
          isActive: false,
          incidentIngestionMode: 'SEMI_AUTOMATIC',
          automaticCreationApproved: false,
        },
        select: {
          id: true,
          slug: true,
          isActive: true,
          incidentIngestionMode: true,
          automaticCreationApproved: true,
        },
      });

      if (
        typeof created?.id !== 'string' ||
        created.id.length === 0 ||
        created.slug !== LAB_IDENTITY.slug ||
        created.isActive !== false ||
        created.incidentIngestionMode !== 'SEMI_AUTOMATIC' ||
        created.automaticCreationApproved !== false
      ) {
        refuse('INVALID_CREATED_TENANT');
      }

      return {
        status: 'INACTIVE_TENANT_CREATED',
        tenantId: created.id,
        slug: created.slug,
        isActive: created.isActive,
        incidentIngestionMode: created.incidentIngestionMode,
        automaticCreationApproved:
          created.automaticCreationApproved,
      };
    },
    {
      isolationLevel: 'Serializable',
      maxWait: 5000,
      timeout: 10000,
    },
  );
}
