import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const dist = process.env.OPENCRISIS_TEST_BUILD_DIR;

const databaseUrl = process.env.DATABASE_URL;

if (
  !dist ||
  process.env.OPENCRISIS_INTEGRATION_TEST !== '1' ||
  process.env.OPENCRISIS_HTTP_TEST_ISOLATED !== '1' ||
  !databaseUrl ||
  new URL(databaseUrl).pathname !== '/opencrisis_ci'
) {
  throw new Error(
    'Ce test exige le laboratoire PostgreSQL opencrisis_ci isolé'
  );
}

const { prisma } = require(
  path.join(dist, 'prisma.js')
);

const {
  getIncidents,
  getIncident,
  updateIncident,
  deleteIncident,
  assertIncidentWritable,
} = require(
  path.join(dist, 'services/incident.js')
);

const {
  requireTenantId,
  assertIncidentReadable,
} = require(
  path.join(dist, 'middleware/tenant.js')
);

const { pubsub } = require(
  path.join(dist, 'pubsub.js')
);

function expectCode(code) {
  return error => {
    assert.equal(error?.extensions?.code, code);
    return true;
  };
}

test(
  'Incidents : isolation de deux organisations en base réelle',
  { timeout: 45000 },
  async t => {
    const suffix = randomUUID();
    const tenantAId = randomUUID();
    const tenantBId = randomUUID();
    const userAId = randomUUID();
    const userBId = randomUUID();

    try {
      await prisma.tenant.createMany({
        data: [
          {
            id: tenantAId,
            name: 'Entreprise A integration',
            slug: `incident-a-${suffix}`,
          },
          {
            id: tenantBId,
            name: 'Entreprise B integration',
            slug: `incident-b-${suffix}`,
          },
        ],
      });

      await prisma.user.createMany({
        data: [
          {
            id: userAId,
            tenantId: tenantAId,
            email: `incident-a-${suffix}@example.invalid`,
            passwordHash: 'integration-only',
            firstName: 'Utilisateur',
            lastName: 'A',
          },
          {
            id: userBId,
            tenantId: tenantBId,
            email: `incident-b-${suffix}@example.invalid`,
            passwordHash: 'integration-only',
            firstName: 'Utilisateur',
            lastName: 'B',
          },
        ],
      });

      const [incidentA, incidentB] =
        await Promise.all([
          prisma.incident.create({
            data: {
              name: 'Incident confidentiel A',
              tenantId: tenantAId,
              createdById: userAId,
            },
          }),
          prisma.incident.create({
            data: {
              name: 'Incident confidentiel B',
              tenantId: tenantBId,
              createdById: userBId,
            },
          }),
        ]);

      await t.test(
        'Le tenant est résolu depuis l utilisateur actif',
        async () => {
          assert.equal(
            await requireTenantId({
              userId: userAId,
              req: null,
              res: null,
            }),
            tenantAId
          );

          assert.equal(
            await requireTenantId({
              userId: userBId,
              req: null,
              res: null,
            }),
            tenantBId
          );
        }
      );

      await t.test(
        'Chaque organisation ne liste que ses incidents',
        async () => {
          const listA = await getIncidents(tenantAId);
          const listB = await getIncidents(tenantBId);

          assert.ok(listA.some(i => i.id === incidentA.id));
          assert.ok(listB.some(i => i.id === incidentB.id));

          assert.ok(!listA.some(i => i.id === incidentB.id));
          assert.ok(!listB.some(i => i.id === incidentA.id));
        }
      );

      await t.test(
        'La lecture d un incident étranger est refusée',
        async () => {
          await assert.rejects(
            getIncident(incidentB.id, tenantAId),
            expectCode('NOT_FOUND')
          );

          await assert.rejects(
            getIncident(incidentA.id, tenantBId),
            expectCode('NOT_FOUND')
          );

          await assert.rejects(
            assertIncidentReadable(incidentB.id, userAId),
            expectCode('NOT_FOUND')
          );

          await assert.rejects(
            assertIncidentReadable(incidentA.id, userBId),
            expectCode('NOT_FOUND')
          );
        }
      );

      await t.test(
        'La modification inter-tenant est refusée',
        async () => {
          await assert.rejects(
            updateIncident(
              incidentB.id,
              { name: 'Modification interdite A' },
              userAId,
              tenantAId
            ),
            expectCode('NOT_FOUND')
          );

          await assert.rejects(
            updateIncident(
              incidentA.id,
              { name: 'Modification interdite B' },
              userBId,
              tenantBId
            ),
            expectCode('NOT_FOUND')
          );

          const storedA = await prisma.incident.findUnique({
            where: { id: incidentA.id },
          });

          const storedB = await prisma.incident.findUnique({
            where: { id: incidentB.id },
          });

          assert.equal(storedA.name, 'Incident confidentiel A');
          assert.equal(storedB.name, 'Incident confidentiel B');
        }
      );

      await t.test(
        'La suppression inter-tenant est refusée',
        async () => {
          await assert.rejects(
            deleteIncident(
              incidentB.id,
              userAId,
              tenantAId
            ),
            expectCode('NOT_FOUND')
          );

          await assert.rejects(
            deleteIncident(
              incidentA.id,
              userBId,
              tenantBId
            ),
            expectCode('NOT_FOUND')
          );

          const stored = await prisma.incident.findMany({
            where: {
              id: { in: [incidentA.id, incidentB.id] },
            },
          });

          assert.equal(stored.length, 2);
          assert.ok(stored.every(i => i.deletedAt === null));
        }
      );

      await t.test(
        'Une écriture liée à un incident étranger est refusée',
        async () => {
          await assert.rejects(
            assertIncidentWritable(
              incidentB.id,
              userAId
            ),
            expectCode('NOT_FOUND')
          );
        }
      );

      await t.test(
        'Une identité absente est refusée',
        async () => {
          await assert.rejects(
            requireTenantId({
              userId: null,
              req: null,
              res: null,
            }),
            expectCode('UNAUTHENTICATED')
          );
        }
      );

      await t.test(
        'Un tenant désactivé est refusé',
        async () => {
          await prisma.tenant.update({
            where: { id: tenantAId },
            data: { isActive: false },
          });

          await assert.rejects(
            requireTenantId({
              userId: userAId,
              req: null,
              res: null,
            }),
            expectCode('FORBIDDEN')
          );
        }
      );

      await t.test(
        'Un utilisateur désactivé est refusé',
        async () => {
          await prisma.user.update({
            where: { id: userBId },
            data: { isActive: false },
          });

          await assert.rejects(
            requireTenantId({
              userId: userBId,
              req: null,
              res: null,
            }),
            expectCode('FORBIDDEN')
          );
        }
      );

      await t.test(
        'Un incident supprimé logiquement est masqué',
        async () => {
          await prisma.incident.update({
            where: { id: incidentB.id },
            data: { deletedAt: new Date() },
          });

          await assert.rejects(
            getIncident(incidentB.id, tenantBId),
            expectCode('NOT_FOUND')
          );

          const visible = await getIncidents(tenantBId);

          assert.ok(
            !visible.some(i => i.id === incidentB.id)
          );
        }
      );
    } finally {
      try {
        if (typeof pubsub.close === 'function') {
          await pubsub.close();
        }
      } finally {
        await prisma.$disconnect();
      }
    }
  }
);
