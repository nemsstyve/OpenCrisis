-- Ajout des indicateurs de compromission OpenCrisis

CREATE TYPE "IoCType" AS ENUM (
    'IPV4',
    'IPV6',
    'HASH_MD5',
    'HASH_SHA1',
    'HASH_SHA256',
    'DOMAIN',
    'URL',
    'EMAIL',
    'YARA',
    'OTHER'
);

CREATE TABLE "IoC" (
    "id" TEXT NOT NULL,
    "timelineEventId" TEXT NOT NULL,
    "type" "IoCType" NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "IoC_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IoC_timelineEventId_createdAt_idx"
    ON "IoC"("timelineEventId", "createdAt");

CREATE INDEX "IoC_createdById_idx"
    ON "IoC"("createdById");

ALTER TABLE "IoC"
    ADD CONSTRAINT "IoC_timelineEventId_fkey"
    FOREIGN KEY ("timelineEventId")
    REFERENCES "TimelineEvent"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IoC"
    ADD CONSTRAINT "IoC_createdById_fkey"
    FOREIGN KEY ("createdById")
    REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
