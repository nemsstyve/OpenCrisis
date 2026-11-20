import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { normalizeShareableIoC, validatedPublicText } = require('/app/dist/services/sharedThreatPolicy.js');

test('SHA256 normalisé', () => {
  assert.equal(normalizeShareableIoC('HASH_SHA256', 'A'.repeat(64)), 'a'.repeat(64));
  assert.throws(() => normalizeShareableIoC('HASH_SHA256', 'a'.repeat(63)));
});
test('Domaines publics, pas de noms internes', () => {
  assert.equal(normalizeShareableIoC('DOMAIN', 'EXAMPLE.ORG.'), 'example.org');
  for (const v of ['intranet.local', 'localhost', 'foo.internal', 'a', 'bad_domain.org']) {
    assert.throws(() => normalizeShareableIoC('DOMAIN', v));
  }
});
test('Pas de journal, email, URL ou IP dans la bibliothèque V0.3', () => {
  for (const type of ['EMAIL','URL','IPV4','YARA','OTHER']) {
    assert.throws(() => normalizeShareableIoC(type, 'secret'));
  }
  assert.throws(() => validatedPublicText('a', 'Titre', 0));
  assert.throws(() => validatedPublicText('a\u0000b', 'Titre', 40));
});
