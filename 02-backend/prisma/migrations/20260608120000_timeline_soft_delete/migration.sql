-- Q7 — soft delete des événements de timeline (préservation de la trace forensique)

-- AlterTable
ALTER TABLE "TimelineEvent" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "TimelineEvent_deletedAt_idx" ON "TimelineEvent"("deletedAt");
