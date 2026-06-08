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
    const role = await prisma.role.upsert({
      where: { name: def.name },
      create: { name: def.name, isSystem: true },
      update: {},
    });

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
      passwordHash: await bcrypt.hash('Admin1234!', 12),
      firstName: 'Admin',
      lastName: 'OpenCrisis',
    },
    update: {},
  });

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'Administrateur' } });
  await prisma.roleAssignment.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    create: { userId: admin.id, roleId: adminRole.id },
    update: {},
  });

  console.log(`  ✔ Admin créé : admin@opencrisis.local / Admin1234!`);
  console.log('Seed terminé.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
