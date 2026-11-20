CREATE TYPE "ThreatReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "SharedThreat" (
 "id" TEXT NOT NULL,
 "indicatorType" "IoCType" NOT NULL,
 "indicatorValue" TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "mitigation" TEXT NOT NULL,
 "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "revokedAt" TIMESTAMP(3),
 "publishedById" TEXT NOT NULL,
 CONSTRAINT "SharedThreat_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SharedThreat_indicatorType_indicatorValue_key" ON "SharedThreat"("indicatorType", "indicatorValue");
CREATE INDEX "SharedThreat_revokedAt_publishedAt_idx" ON "SharedThreat"("revokedAt", "publishedAt");

CREATE TABLE "ThreatSubmission" (
 "id" TEXT NOT NULL,
 "tenantId" TEXT NOT NULL,
 "sourceIoCId" TEXT NOT NULL,
 "indicatorType" "IoCType" NOT NULL,
 "indicatorValue" TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "mitigation" TEXT NOT NULL,
 "status" "ThreatReviewStatus" NOT NULL DEFAULT 'PENDING',
 "submittedById" TEXT NOT NULL,
 "reviewedById" TEXT,
 "reviewedAt" TIMESTAMP(3),
 "publishedThreatId" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ThreatSubmission_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ThreatSubmission_tenantId_status_createdAt_idx" ON "ThreatSubmission"("tenantId","status","createdAt");
CREATE INDEX "ThreatSubmission_status_createdAt_idx" ON "ThreatSubmission"("status","createdAt");
ALTER TABLE "ThreatSubmission" ADD CONSTRAINT "ThreatSubmission_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ThreatSubmission" ADD CONSTRAINT "ThreatSubmission_publishedThreatId_fkey"
  FOREIGN KEY ("publishedThreatId") REFERENCES "SharedThreat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "IncidentThreatLink" (
 "id" TEXT NOT NULL,
 "tenantId" TEXT NOT NULL,
 "incidentId" TEXT NOT NULL,
 "threatId" TEXT NOT NULL,
 "linkedById" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "IncidentThreatLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IncidentThreatLink_tenantId_incidentId_threatId_key" ON "IncidentThreatLink"("tenantId","incidentId","threatId");
CREATE INDEX "IncidentThreatLink_tenantId_createdAt_idx" ON "IncidentThreatLink"("tenantId","createdAt");
ALTER TABLE "IncidentThreatLink" ADD CONSTRAINT "IncidentThreatLink_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IncidentThreatLink" ADD CONSTRAINT "IncidentThreatLink_incidentId_fkey"
  FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IncidentThreatLink" ADD CONSTRAINT "IncidentThreatLink_threatId_fkey"
  FOREIGN KEY ("threatId") REFERENCES "SharedThreat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Défense supplémentaire contre les liens croisés, même en dehors de GraphQL.
CREATE FUNCTION "check_incident_threat_tenant"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Incident" i
    JOIN "Tenant" t ON t."id" = i."tenantId"
    JOIN "User" u ON u."id" = NEW."linkedById"
    JOIN "SharedThreat" k ON k."id" = NEW."threatId"
    WHERE i."id" = NEW."incidentId"
      AND i."tenantId" = NEW."tenantId"
      AND i."deletedAt" IS NULL
      AND t."isActive" = true
      AND u."tenantId" = NEW."tenantId"
      AND u."isActive" = true AND u."deletedAt" IS NULL
      AND k."revokedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'Association menace/incident hors tenant ou invalide'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "IncidentThreatLink_tenant_guard"
 BEFORE INSERT OR UPDATE ON "IncidentThreatLink"
 FOR EACH ROW EXECUTE FUNCTION "check_incident_threat_tenant"();
