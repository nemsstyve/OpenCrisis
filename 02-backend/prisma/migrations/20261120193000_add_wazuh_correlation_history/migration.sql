CREATE TABLE "WazuhCorrelationRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "matched" BOOLEAN NOT NULL,
    "confidence" INTEGER NOT NULL,
    "matches" JSONB NOT NULL,
    "correlatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WazuhCorrelationRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX
    "WazuhCorrelationRecord_tenantId_sourceId_externalEventId_key"
ON "WazuhCorrelationRecord"
    ("tenantId", "sourceId", "externalEventId");

CREATE INDEX
    "WazuhCorrelationRecord_tenantId_correlatedAt_idx"
ON "WazuhCorrelationRecord"
    ("tenantId", "correlatedAt");

ALTER TABLE "WazuhCorrelationRecord"
ADD CONSTRAINT "WazuhCorrelationRecord_tenantId_fkey"
FOREIGN KEY ("tenantId")
REFERENCES "Tenant"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
