/**
 * Preflight Deteris-R2D Lab.
 *
 * Lit uniquement un inventaire JSON depuis stdin.
 * N'importe ni Prisma, ni outil d'execution SQL.
 * Ne peut pas creer d'organisation.
 */

import {
  prepareLabTenantPlan,
} from './deteris-lab-provisioning-plan.mjs';

const MAX_INPUT = 65536;

export function validateLiveInventory(snapshot) {
  if (
    !snapshot ||
    typeof snapshot !== 'object' ||
    Array.isArray(snapshot)
  ) {
    throw new Error('INVALID_LIVE_INVENTORY');
  }

  const keys = Object.keys(snapshot).sort();

  const expected = [
    'administratorRoles',
    'adminWritePermissions',
    'dashboardWritePermissions',
    'tenants',
  ].sort();

  if (
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index])
  ) {
    throw new Error('INVALID_LIVE_INVENTORY_FIELDS');
  }

  if (
    !Array.isArray(snapshot.tenants) ||
    !snapshot.tenants.every(
      tenant =>
        tenant &&
        typeof tenant.slug === 'string' &&
        typeof tenant.isActive === 'boolean' &&
        Object.keys(tenant).sort().join(',') ===
          'isActive,slug'
    )
  ) {
    throw new Error('INVALID_LIVE_TENANTS');
  }

  const slugs = snapshot.tenants.map(
    tenant => tenant.slug
  );

  if (new Set(slugs).size !== slugs.length) {
    throw new Error('DUPLICATE_LIVE_TENANT_SLUG');
  }

  return prepareLabTenantPlan(snapshot);
}

async function main() {
  let raw = '';

  for await (const chunk of process.stdin) {
    raw += chunk.toString('utf8');

    if (Buffer.byteLength(raw, 'utf8') > MAX_INPUT) {
      throw new Error('INVENTORY_TOO_LARGE');
    }
  }

  if (!raw.trim()) {
    throw new Error('EMPTY_INVENTORY');
  }

  const snapshot = JSON.parse(raw);
  const plan = validateLiveInventory(snapshot);

  if (plan.executionAllowed !== false) {
    throw new Error('UNEXPECTED_EXECUTION_AUTHORIZATION');
  }

  console.log('PASS : inventaire reel conforme');
  console.log('PLAN :', plan.operation);
  console.log('NOM :', plan.target.name);
  console.log('SLUG :', plan.target.slug);
  console.log('ACTIF :', plan.target.isActive);
  console.log(
    'POLITIQUE :',
    plan.target.incidentIngestionMode
  );
  console.log(
    'AUTOMATISATION APPROUVEE :',
    plan.target.automaticCreationApproved
  );
  console.log(
    'EXECUTION AUTORISEE :',
    plan.executionAllowed
  );
  console.log('AUCUNE ECRITURE DEMANDEE');
}

if (
  process.argv[1] &&
  import.meta.url ===
    new URL(`file://${process.argv[1]}`).href
) {
  main().catch(error => {
    console.error(
      'REFUS PREFLIGHT :',
      error instanceof Error ? error.message : 'UNKNOWN'
    );
    process.exitCode = 1;
  });
}
