import { PrismaClient, PermissionResource, PermissionAction } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ALL_RESOURCES = Object.values(PermissionResource);
const ALL_ACTIONS = Object.values(PermissionAction);

const ROLE_DEFINITIONS: Array<{
  name: string;
  permissions: Array<{ resource: PermissionResource; action: PermissionAction }>;
}> = [
  {
    name: 'Administrateur',
    permissions: ALL_RESOURCES.flatMap(r => ALL_ACTIONS.map(a => ({ resource: r, action: a }))),
  },
  {
    name: 'Pilote de crise',
    permissions: ALL_RESOURCES
      .filter(r => r !== PermissionResource.ADMIN)
      .flatMap(r => ALL_ACTIONS.map(a => ({ resource: r, action: a }))),
  },
  {
    name: 'Cellule Directionnelle',
    permissions: [
      PermissionResource.DASHBOARD,
      PermissionResource.MAIN_COURANTE_DIR,
      PermissionResource.TIMELINE,
      PermissionResource.ANNUAIRE,
      PermissionResource.DOCUMENTS,
    ].flatMap(r => ALL_ACTIONS.map(a => ({ resource: r, action: a }))),
  },
  {
    name: 'Cellule Opérationnelle',
    permissions: [
      PermissionResource.DASHBOARD,
      PermissionResource.MAIN_COURANTE_OPS,
      PermissionResource.TIMELINE,
      PermissionResource.ANNUAIRE,
      PermissionResource.DOCUMENTS,
    ].flatMap(r => ALL_ACTIONS.map(a => ({ resource: r, action: a }))),
  },
  {
    name: 'Observateur',
    permissions: [
      PermissionResource.DASHBOARD,
      PermissionResource.TIMELINE,
      PermissionResource.BIBLIOTHEQUE,
      PermissionResource.DOCUMENTS,
    ].map(r => ({ resource: r, action: PermissionAction.READ })),
  },
];

async function main() {
  const tenantId = process.env.OPENCRISIS_BOOTSTRAP_TENANT_ID;
  const bootstrapPassword =
    process.env.OPENCRISIS_BOOTSTRAP_ADMIN_PASSWORD;

  if (!tenantId || !bootstrapPassword ||
      bootstrapPassword.length < 16) {
    throw new Error(
      'Bootstrap refuse : tenant et mot de passe ' +
      'explicites requis (16 caracteres minimum)',
    );
  }

  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, isActive: true },
    select: { id: true },
  });

  if (!tenant) {
    throw new Error('Tenant de bootstrap introuvable ou inactif');
  }

  const existingAdmin = await prisma.user.findUnique({
    where: { email: 'admin@opencrisis.local' },
    select: { tenantId: true },
  });

  if (existingAdmin && existingAdmin.tenantId !== tenantId) {
    throw new Error(
      'Administrateur existant : rattachement manuel requis',
    );
  }

  // 1. Create all permissions (resource × action)
  for (const resource of ALL_RESOURCES) {
    for (const action of ALL_ACTIONS) {
      await prisma.permission.upsert({
        where: { resource_action: { resource, action } },
        create: { resource, action },
        update: {},
      });
    }
  }
  console.log(`  ✔ ${ALL_RESOURCES.length * ALL_ACTIONS.length} permissions créées`);

  // 2. Create system roles and assign permissions
  for (const def of ROLE_DEFINITIONS) {
    let role = await prisma.role.findFirst({
      where: {
        name: def.name,
        tenantId: null,
        isSystem: true,
      },
    });

    if (!role) {
      role = await prisma.role.create({
        data: {
          name: def.name,
          tenantId: null,
          isSystem: true,
        },
      });
    }

    for (const { resource, action } of def.permissions) {
      const perm = await prisma.permission.findUniqueOrThrow({
        where: { resource_action: { resource, action } },
      });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        create: { roleId: role.id, permissionId: perm.id },
        update: {},
      });
    }
  }
  console.log(`  ✔ ${ROLE_DEFINITIONS.length} rôles système créés`);

  // 3. Create admin user
  const admin = await prisma.user.upsert({
    where: { email: 'admin@opencrisis.local' },
    create: {
      email: 'admin@opencrisis.local',
      tenantId,
      passwordHash: await bcrypt.hash(bootstrapPassword, 12),
      firstName: 'Admin',
      lastName: 'OpenCrisis',
      mustChangePassword: true,
    },
    update: {},
  });

  const adminRole = await prisma.role.findFirstOrThrow({
    where: {
      name: 'Administrateur',
      tenantId: null,
      isSystem: true,
    },
  });
  await prisma.roleAssignment.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    create: { userId: admin.id, roleId: adminRole.id },
    update: {},
  });

  console.log(
    '  ✔ Compte de bootstrap verifie : admin@opencrisis.local',
  );
  console.log('Seed terminé.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
