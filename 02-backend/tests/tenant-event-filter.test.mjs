import test from 'node:test';
import assert from 'node:assert/strict';

import {
  tenantEventFilter
} from '../src/middleware/tenantEventFilter.ts';

async function* events() {
  yield { tenantId: 'entreprise-A', id: 'A1' };
  yield { tenantId: 'entreprise-B', id: 'B1' };
  yield { tenantId: 'entreprise-A', id: 'A2' };
}

test('A ne recoit aucun evenement de B', async () => {
  const received = [];

  for await (const event of tenantEventFilter(
    events(),
    'entreprise-A',
    async () => 'entreprise-A',
    event => event.tenantId,
  )) {
    received.push(event.id);
  }

  assert.deepEqual(received, ['A1', 'A2']);
});

test('B ne recoit aucun evenement de A', async () => {
  const received = [];

  for await (const event of tenantEventFilter(
    events(),
    'entreprise-B',
    async () => 'entreprise-B',
    event => event.tenantId,
  )) {
    received.push(event.id);
  }

  assert.deepEqual(received, ['B1']);
});

test('absence de tenant refuse tout evenement', async () => {
  const received = [];

  for await (const event of tenantEventFilter(
    events(),
    '',
    async () => 'entreprise-A',
    event => event.tenantId,
  )) {
    received.push(event.id);
  }

  assert.deepEqual(received, []);
});

test('changement de tenant ferme le flux', async () => {
  let checks = 0;
  const received = [];

  for await (const event of tenantEventFilter(
    events(),
    'entreprise-A',
    async () => {
      checks++;
      return checks === 1
        ? 'entreprise-A'
        : 'entreprise-B';
    },
    event => event.tenantId,
  )) {
    received.push(event.id);
  }

  assert.deepEqual(received, ['A1']);
});

test('erreur de verification ferme le flux', async () => {
  const received = [];

  for await (const event of tenantEventFilter(
    events(),
    'entreprise-A',
    async () => {
      throw new Error('Acces revoque');
    },
    event => event.tenantId,
  )) {
    received.push(event.id);
  }

  assert.deepEqual(received, []);
});
