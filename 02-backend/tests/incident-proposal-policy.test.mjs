import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateIncidentAlert,
} from '../src/services/incidentProposalPolicy.ts';

const base = {
  connectorTenantId: 'entreprise-A',
  eventTenantId: 'entreprise-A',
  sourceId: 'wazuh-01',
  externalEventId: 'alert-001',
  mode: 'SEMI_AUTOMATIC',
  severity: 'HIGH',
  automationApproved: false,
};

test('mode manuel sans creation externe', () => {
  const result = evaluateIncidentAlert({
    ...base,
    mode: 'MANUAL',
  });

  assert.equal(result.decision, 'MANUAL_ONLY');
});

test('mode semi-automatique propose validation', () => {
  const result = evaluateIncidentAlert(base);

  assert.equal(result.decision, 'PROPOSE');
});

test('mode automatique non approuve reste humain', () => {
  const result = evaluateIncidentAlert({
    ...base,
    mode: 'AUTOMATIC',
    severity: 'CRITICAL',
  });

  assert.equal(result.decision, 'PROPOSE');
});

test('automatisation critique approuvee admissible', () => {
  const result = evaluateIncidentAlert({
    ...base,
    mode: 'AUTOMATIC',
    severity: 'CRITICAL',
    automationApproved: true,
  });

  assert.equal(
    result.decision,
    'AUTO_CREATE_ELIGIBLE',
  );
});

test('gravite HIGH ne suffit pas pour automatiser', () => {
  const result = evaluateIncidentAlert({
    ...base,
    mode: 'AUTOMATIC',
    severity: 'HIGH',
    automationApproved: true,
  });

  assert.equal(result.decision, 'PROPOSE');
});

test('alerte entreprise B refusee par connecteur A', () => {
  assert.throws(
    () => evaluateIncidentAlert({
      ...base,
      eventTenantId: 'entreprise-B',
    }),
    /incoherence inter-tenant/,
  );
});

test('connecteur sans entreprise refuse', () => {
  assert.throws(
    () => evaluateIncidentAlert({
      ...base,
      connectorTenantId: '',
    }),
    /connectorTenantId/,
  );
});

test('source absente refusee', () => {
  assert.throws(
    () => evaluateIncidentAlert({
      ...base,
      sourceId: '',
    }),
    /sourceId/,
  );
});

test('reference externe absente refusee', () => {
  assert.throws(
    () => evaluateIncidentAlert({
      ...base,
      externalEventId: '',
    }),
    /externalEventId/,
  );
});

test('mode inconnu refuse', () => {
  assert.throws(
    () => evaluateIncidentAlert({
      ...base,
      mode: 'INCONNU',
    }),
    /Mode ingestion invalide/,
  );
});

test('gravite inconnue refusee', () => {
  assert.throws(
    () => evaluateIncidentAlert({
      ...base,
      severity: 'UNKNOWN',
    }),
    /Gravite invalide/,
  );
});

test('automatisation sans booleen valide refusee', () => {
  assert.throws(
    () => evaluateIncidentAlert({
      ...base,
      automationApproved: 'yes',
    }),
    /Configuration automatisation invalide/,
  );
});

test('identite entreprise conservee dans la decision', () => {
  const result = evaluateIncidentAlert(base);

  assert.equal(result.tenantId, 'entreprise-A');
  assert.equal(result.sourceId, 'wazuh-01');
  assert.equal(result.externalEventId, 'alert-001');
});
