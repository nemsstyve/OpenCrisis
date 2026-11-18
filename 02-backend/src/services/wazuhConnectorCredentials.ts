import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

// 32 octets aleatoires = 256 bits d'entropie.
// L'encodage base64url de 32 octets fait 43 caracteres.
const SECRET_PATTERN = /^ocwz_[A-Za-z0-9_-]{43}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;

export function generateWazuhConnectorSecret(): string {
  return `ocwz_${randomBytes(32).toString('base64url')}`;
}

export function isValidWazuhConnectorSecret(
  value: unknown,
): value is string {
  return (
    typeof value === 'string' &&
    SECRET_PATTERN.test(value)
  );
}

export function hashWazuhConnectorSecret(
  secret: unknown,
): string {
  if (!isValidWazuhConnectorSecret(secret)) {
    throw new Error('Format de secret connecteur invalide');
  }

  return createHash('sha256')
    .update(secret, 'utf8')
    .digest('hex');
}

export function verifyWazuhConnectorSecret(
  presentedSecret: unknown,
  storedHash: unknown,
): boolean {
  if (
    !isValidWazuhConnectorSecret(presentedSecret) ||
    typeof storedHash !== 'string' ||
    !HASH_PATTERN.test(storedHash)
  ) {
    return false;
  }

  const calculated = createHash('sha256')
    .update(presentedSecret, 'utf8')
    .digest();

  const expected = Buffer.from(storedHash, 'hex');

  return timingSafeEqual(calculated, expected);
}
