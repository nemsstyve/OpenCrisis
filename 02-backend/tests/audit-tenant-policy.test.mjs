import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAuditTenantId } from
  '../src/middleware/auditTenantPolicy.ts';

test('audit utilisateur A rattache au tenant A', () => {
  assert.equal(resolveAuditTenantId({
    userId: 'user-a',
    userTenantId: 'tenant-a',
    resource: 'ADMIN',
    action: 'UPDATE',
  }), 'tenant-a');
});

test('audit utilisateur B rattache au tenant B', () => {
  assert.equal(resolveAuditTenantId({
    userId: 'user-b',
    userTenantId: 'tenant-b',
    resource: 'ADMIN',
    action: 'DELETE',
  }), 'tenant-b');
});

test('utilisateur A et incident A sont compatibles', () => {
  assert.equal(resolveAuditTenantId({
    userId: 'user-a',
    userTenantId: 'tenant-a',
    incidentId: 'incident-a',
    incidentTenantId: 'tenant-a',
    resource: 'INCIDENT',
    action: 'UPDATE',
  }), 'tenant-a');
});

test('utilisateur A et incident B sont refuses', () => {
  assert.throws(() => resolveAuditTenantId({
    userId: 'user-a',
    userTenantId: 'tenant-a',
    incidentId: 'incident-b',
    incidentTenantId: 'tenant-b',
    resource: 'INCIDENT',
    action: 'DELETE',
  }), /incoherence inter-tenant/);
});

test('utilisateur sans tenant est refuse', () => {
  assert.throws(() => resolveAuditTenantId({
    userId: 'user-a',
    userTenantId: null,
    resource: 'ADMIN',
    action: 'CREATE',
  }), /utilisateur sans tenant/);
});

test('incident sans tenant est refuse', () => {
  assert.throws(() => resolveAuditTenantId({
    incidentId: 'incident-a',
    incidentTenantId: null,
    resource: 'INCIDENT',
    action: 'UPDATE',
  }), /incident sans tenant/);
});

test('echec de connexion anonyme autorise audit global', () => {
  assert.equal(resolveAuditTenantId({
    resource: 'AUTH',
    action: 'LOGIN_FAILED',
  }), null);

  assert.throws(() => resolveAuditTenantId({
    resource: 'ADMIN',
    action: 'UPDATE',
  }), /entreprise introuvable/);
});
