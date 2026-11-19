import { GraphQLError } from 'graphql';
import { prisma } from '../prisma';

const MAX_ATTEMPTS = 10;

/**
 * Compteur persistant commun à toutes les instances.
 *
 * L'UPSERT garantit une incrémentation atomique,
 * y compris lors de connexions concurrentes.
 *
 * L'opération est volontairement distincte de la
 * transaction d'authentification : un refus du code
 * TOTP ne doit jamais annuler le compteur.
 */
export async function consumeMfaAttempt(
  userId: string,
): Promise<void> {
  if (!userId) {
    throw new Error('Identifiant MFA requis');
  }

  const rows = await prisma.$queryRaw<
    Array<{ attempts: number }>
  >`
    INSERT INTO "MfaAttemptBucket"
      ("userId", "attempts", "resetAt")
    VALUES (
      ${userId},
      1,
      NOW() + INTERVAL '15 minutes'
    )
    ON CONFLICT ("userId") DO UPDATE
    SET
      "attempts" =
        CASE
          WHEN "MfaAttemptBucket"."resetAt" <= NOW()
          THEN 1
          ELSE "MfaAttemptBucket"."attempts" + 1
        END,
      "resetAt" =
        CASE
          WHEN "MfaAttemptBucket"."resetAt" <= NOW()
          THEN NOW() + INTERVAL '15 minutes'
          ELSE "MfaAttemptBucket"."resetAt"
        END
    RETURNING "attempts"
  `;

  if (rows.length !== 1) {
    throw new Error('Compteur MFA indisponible');
  }

  if (rows[0].attempts > MAX_ATTEMPTS) {
    throw new GraphQLError(
      'Trop de tentatives de verification. Reessayez plus tard.',
      { extensions: { code: 'TOO_MANY_REQUESTS' } },
    );
  }
}
