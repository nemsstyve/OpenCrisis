import {
  randomBytes,
  createHmac,
  createHash,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

export function encodeBase32(data: Buffer): string {
  let bits = 0;
  let value = 0;
  let result = '';

  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      result += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    result += ALPHABET[(value << (5 - bits)) & 31];
  }

  return result;
}

function decodeBase32(secret: string): Buffer {
  if (
    typeof secret !== 'string' ||
    !/^[A-Z2-7]{16,128}$/.test(secret)
  ) {
    throw new Error('Secret TOTP invalide');
  }

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const character of secret) {
    const index = ALPHABET.indexOf(character);

    if (index < 0) {
      throw new Error('Secret TOTP invalide');
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  const output = Buffer.from(bytes);

  if (encodeBase32(output) !== secret) {
    throw new Error('Encodage TOTP non canonique');
  }

  return output;
}

export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(20));
}

function codeForStep(
  secret: string,
  step: number,
): string {
  if (!Number.isSafeInteger(step) || step < 0) {
    throw new Error('Compteur TOTP invalide');
  }

  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));

  const digest = createHmac(
    'sha1',
    decodeBase32(secret),
  ).update(counter).digest();

  const offset = digest[digest.length - 1] & 15;

  const value =
    (digest.readUInt32BE(offset) & 0x7fffffff)
    % (10 ** DIGITS);

  return String(value).padStart(DIGITS, '0');
}

export function totpCodeAt(
  secret: string,
  timestampMs: number,
): string {
  if (!Number.isFinite(timestampMs) || timestampMs < 0) {
    throw new Error('Date TOTP invalide');
  }

  return codeForStep(
    secret,
    Math.floor(timestampMs / (STEP_SECONDS * 1000)),
  );
}

/**
 * Retourne le compteur valide, ou null.
 * lastUsedStep permet de bloquer la réutilisation.
 * L'actualisation en base doit être atomique.
 */
export function verifyTotpStep(
  secret: string,
  code: string,
  timestampMs = Date.now(),
  lastUsedStep: bigint | null = null,
): bigint | null {
  if (!/^[0-9]{6}$/.test(code)) {
    return null;
  }

  if (!Number.isFinite(timestampMs) || timestampMs < 0) {
    return null;
  }

  const current = Math.floor(
    timestampMs / (STEP_SECONDS * 1000),
  );

  const submitted = Buffer.from(code);

  for (const delta of [-1, 0, 1]) {
    const step = current + delta;

    if (step < 0) continue;

    if (
      lastUsedStep !== null &&
      BigInt(step) <= lastUsedStep
    ) {
      continue;
    }

    const expected = Buffer.from(
      codeForStep(secret, step),
    );

    if (timingSafeEqual(expected, submitted)) {
      return BigInt(step);
    }
  }

  return null;
}

function encryptionKey(keyHex?: string): Buffer {
  const supplied = keyHex ?? process.env.TOTP_ENCRYPTION_KEY;

  if (
    !supplied ||
    !/^[a-fA-F0-9]{64}$/.test(supplied)
  ) {
    throw new Error(
      'Cle de chiffrement TOTP absente ou invalide',
    );
  }

  return Buffer.from(supplied, 'hex');
}

/**
 * AES-256-GCM, avec l'identifiant utilisateur
 * comme donnée associée authentifiée.
 */
export function encryptTotpSecret(
  secret: string,
  userId: string,
  keyHex?: string,
): string {
  decodeBase32(secret);

  if (!userId) throw new Error('Utilisateur requis');

  const iv = randomBytes(12);

  const cipher = createCipheriv(
    'aes-256-gcm',
    encryptionKey(keyHex),
    iv,
  );

  cipher.setAAD(Buffer.from(userId, 'utf8'));

  const encrypted = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return Buffer.concat([
    Buffer.from([1]),
    iv,
    tag,
    encrypted,
  ]).toString('base64');
}

export function decryptTotpSecret(
  ciphertext: string,
  userId: string,
  keyHex?: string,
): string {
  if (!userId) throw new Error('Utilisateur requis');

  const raw = Buffer.from(ciphertext, 'base64');

  if (
    raw.length <= 29 ||
    raw[0] !== 1 ||
    raw.toString('base64') !== ciphertext
  ) {
    throw new Error('Secret chiffre invalide');
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(keyHex),
    raw.subarray(1, 13),
  );

  decipher.setAAD(Buffer.from(userId, 'utf8'));
  decipher.setAuthTag(raw.subarray(13, 29));

  const secret = Buffer.concat([
    decipher.update(raw.subarray(29)),
    decipher.final(),
  ]).toString('utf8');

  decodeBase32(secret);

  return secret;
}

/**
 * Codes de récupération à forte entropie.
 * Seules leurs empreintes sont destinées à la base.
 */
export function generateRecoveryCodes(
  count = 10,
): string[] {
  if (!Number.isInteger(count) || count < 1 || count > 20) {
    throw new Error('Nombre de codes invalide');
  }

  return Array.from(
    { length: count },
    () => randomBytes(20).toString('hex'),
  );
}

export function hashRecoveryCode(code: string): string {
  if (!/^[a-f0-9]{40}$/.test(code)) {
    throw new Error('Code de récupération invalide');
  }

  return createHash('sha256')
    .update(Buffer.from(code, 'hex'))
    .digest('hex');
}
