CREATE TABLE "MfaAttemptBucket" (
    "userId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MfaAttemptBucket_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "MfaAttemptBucket"
ADD CONSTRAINT "MfaAttemptBucket_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
