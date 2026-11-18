import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateWazuhConnectorSecret,
  isValidWazuhConnectorSecret,
  hashWazuhConnectorSecret,
  verifyWazuhConnectorSecret,
} from '../src/services/wazuhConnectorCredentials.ts';

test('secret genere au format attendu', () => {
  const secret = generateWazuhConnectorSecret();

  assert.match(secret, /^ocwz_[A-Za-z0-9_-]{43}$/);
  assert.equal(isValidWazuhConnectorSecret(secret), true);
});

test('generation de 100 secrets distincts', () => {
  const generated = Array.from(
    { length: 100 },
    generateWazuhConnectorSecret,
  );

  assert.equal(new Set(generated).size, 100);
});

test('empreinte SHA-256 hexadecimale valide', () => {
  const secret = generateWazuhConnectorSecret();
  const hash = hashWazuhConnectorSecret(secret);

  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash.includes(secret), false);
});

test('secret correct accepte', () => {
  const secret = generateWazuhConnectorSecret();
  const hash = hashWazuhConnectorSecret(secret);

  assert.equal(
    verifyWazuhConnectorSecret(secret, hash),
    true,
  );
});

test('secret incorrect refuse', () => {
  const legitimate = generateWazuhConnectorSecret();
  const attacker = generateWazuhConnectorSecret();

  assert.equal(
    verifyWazuhConnectorSecret(
      attacker,
      hashWazuhConnectorSecret(legitimate),
    ),
    false,
  );
});

test('secret tronque ou malforme refuse', () => {
  const secret = generateWazuhConnectorSecret();
  const hash = hashWazuhConnectorSecret(secret);

  for (const input of [
    '',
    'ocwz_invalid',
    secret.slice(0, -1),
    ` ${secret}`,
    `${secret}\n`,
    null,
    undefined,
    123,
    {},
  ]) {
    assert.equal(
      verifyWazuhConnectorSecret(input, hash),
      false,
    );
  }
});

test('empreinte invalide refusee', () => {
  const secret = generateWazuhConnectorSecret();

  for (const hash of [
    '',
    'secret-en-clair',
    'a'.repeat(63),
    'A'.repeat(64),
    null,
    undefined,
  ]) {
    assert.equal(
      verifyWazuhConnectorSecret(secret, hash),
      false,
    );
  }
});

test('hachage de secret invalide interdit', () => {
  for (const value of [
    '',
    'password',
    null,
    undefined,
    'ocwz_short',
  ]) {
    assert.throws(
      () => hashWazuhConnectorSecret(value),
      /Format de secret/,
    );
  }
});

test('empreinte deterministe pour un meme secret', () => {
  const secret = generateWazuhConnectorSecret();

  assert.equal(
    hashWazuhConnectorSecret(secret),
    hashWazuhConnectorSecret(secret),
  );
});
