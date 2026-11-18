-- Migration additive : aucune session existante supprimee.
-- sessionId reste nullable pendant la transition.

CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuthSession_userId_revokedAt_idx"
    ON "AuthSession"("userId", "revokedAt");

CREATE INDEX "AuthSession_expiresAt_idx"
    ON "AuthSession"("expiresAt");

ALTER TABLE "AuthSession"
    ADD CONSTRAINT "AuthSession_userId_fkey"
    FOREIGN KEY ("userId")
    REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RefreshToken"
    ADD COLUMN "sessionId" TEXT;

CREATE INDEX "RefreshToken_sessionId_idx"
    ON "RefreshToken"("sessionId");

ALTER TABLE "RefreshToken"
    ADD CONSTRAINT "RefreshToken_sessionId_fkey"
    FOREIGN KEY ("sessionId")
    REFERENCES "AuthSession"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
