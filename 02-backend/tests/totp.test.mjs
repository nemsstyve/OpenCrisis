import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

const dir = process.env.OPENCRISIS_TEST_BUILD_DIR;

if (!dir) {
  throw new Error('OPENCRISIS_TEST_BUILD_DIR requis');
}

const {
  encodeBase32,
  generateTotpSecret,
  totpCodeAt,
  verifyTotpStep,
  encryptTotpSecret,
  decryptTotpSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
} = require(path.join(dir, 'services', 'totp.js'));

const key = 'a1'.repeat(32);
const secret = encodeBase32(
  Buffer.from('12345678901234567890'),
);

test('TOTP respecte le vecteur RFC 6238', () => {
  assert.equal(totpCodeAt(secret, 59000), '287082');
});

test('TOTP accepte un code valide', () => {
  assert.equal(
    verifyTotpStep(secret, '287082', 59000),
    1n,
  );
});

test('TOTP refuse un code invalide', () => {
  assert.equal(
    verifyTotpStep(secret, 'abcdef', 59000),
    null,
  );
  assert.equal(
    verifyTotpStep(secret, '0000000', 59000),
    null,
  );
});

test('TOTP refuse la reutilisation du compteur', () => {
  assert.equal(
    verifyTotpStep(secret, '287082', 59000, 1n),
    null,
  );
});

test('TOTP accepte une tolerance de 30 secondes', () => {
  assert.equal(
    verifyTotpStep(secret, '287082', 60000),
    1n,
  );
});

test('Un secret TOTP est aleatoire', () => {
  const a = generateTotpSecret();
  const b = generateTotpSecret();

  assert.notEqual(a, b);
  assert.match(a, /^[A-Z2-7]{32}$/);
});

test('AES-GCM chiffre puis dechiffre le secret', () => {
  const ciphertext = encryptTotpSecret(
    secret,
    'utilisateur-a',
    key,
  );

  assert.notEqual(ciphertext, secret);

  assert.equal(
    decryptTotpSecret(
      ciphertext,
      'utilisateur-a',
      key,
    ),
    secret,
  );
});

test('AES-GCM refuse une autre identite', () => {
  const ciphertext = encryptTotpSecret(
    secret,
    'utilisateur-a',
    key,
  );

  assert.throws(() =>
    decryptTotpSecret(
      ciphertext,
      'utilisateur-b',
      key,
    )
  );
});

test('AES-GCM refuse une cle incorrecte', () => {
  const ciphertext = encryptTotpSecret(
    secret,
    'utilisateur-a',
    key,
  );

  assert.throws(() =>
    decryptTotpSecret(
      ciphertext,
      'utilisateur-a',
      'b2'.repeat(32),
    )
  );
});

test('Codes de recuperation uniques et non stockes en clair', () => {
  const codes = generateRecoveryCodes();

  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);

  for (const code of codes) {
    assert.match(code, /^[a-f0-9]{40}$/);
    assert.notEqual(hashRecoveryCode(code), code);
  }
});
