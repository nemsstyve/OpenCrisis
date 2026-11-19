CREATE TABLE "TotpCredential" (
    "userId" TEXT NOT NULL,
    "secretCiphertext" TEXT,
    "pendingSecretCiphertext" TEXT,
    "pendingExpiresAt" TIMESTAMP(3),
    "enabledAt" TIMESTAMP(3),
    "lastUsedStep" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TotpCredential_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "TotpRecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TotpRecoveryCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TotpRecoveryCode_codeHash_key"
ON "TotpRecoveryCode"("codeHash");

CREATE INDEX "TotpRecoveryCode_userId_usedAt_idx"
ON "TotpRecoveryCode"("userId", "usedAt");

ALTER TABLE "TotpCredential"
ADD CONSTRAINT "TotpCredential_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TotpRecoveryCode"
ADD CONSTRAINT "TotpRecoveryCode_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "TotpCredential"("userId")
ON DELETE CASCADE ON UPDATE CASCADE;
