-- OpenCrisis / DETERIS R2D
-- Proposition d'incidents et modes d'ingestion.
-- Migration additive ; aucune donnee historique supprimee.

CREATE TYPE "IncidentIngestionMode"
AS ENUM ('MANUAL', 'SEMI_AUTOMATIC', 'AUTOMATIC');

CREATE TYPE "IncidentProposalStatus"
AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CONVERTED');

ALTER TABLE "Tenant"
    ADD COLUMN "automaticCreationApproved"
        BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "incidentIngestionMode"
        "IncidentIngestionMode" NOT NULL DEFAULT 'MANUAL';

CREATE TABLE "IncidentProposal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" "Severity" NOT NULL,
    "status" "IncidentProposalStatus"
        NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "incidentId" TEXT,
    "receivedAt" TIMESTAMP(3)
        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3)
        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncidentProposal_pkey"
        PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX
    "IncidentProposal_incidentId_key"
ON "IncidentProposal"("incidentId");

CREATE INDEX
    "IncidentProposal_tenantId_status_createdAt_idx"
ON "IncidentProposal"(
    "tenantId", "status", "createdAt"
);

CREATE INDEX
    "IncidentProposal_tenantId_severity_idx"
ON "IncidentProposal"("tenantId", "severity");

CREATE UNIQUE INDEX
    "IncidentProposal_tenantId_sourceId_externalEventId_key"
ON "IncidentProposal"(
    "tenantId", "sourceId", "externalEventId"
);

ALTER TABLE "IncidentProposal"
    ADD CONSTRAINT "IncidentProposal_tenantId_fkey"
    FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "IncidentProposal"
    ADD CONSTRAINT "IncidentProposal_reviewedById_fkey"
    FOREIGN KEY ("reviewedById")
    REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "IncidentProposal"
    ADD CONSTRAINT "IncidentProposal_incidentId_fkey"
    FOREIGN KEY ("incidentId")
    REFERENCES "Incident"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Protection 1 :
-- Interdire les references inter-tenant d'une proposition.
-- FOR SHARE verrouille les lignes consultees
-- contre une modification concurrente du tenantId.

CREATE FUNCTION incident_proposal_tenant_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $guard$
DECLARE
    v_tenant TEXT;
BEGIN
    IF NEW."tenantId" IS NULL THEN
        RAISE EXCEPTION
            'IncidentProposal : tenant absent'
            USING ERRCODE = '23514';
    END IF;

    -- L'entreprise d'origine est immuable.
    -- Aucune reaffectation, meme avant validation.
    IF TG_OP = 'UPDATE'
       AND NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    THEN
        RAISE EXCEPTION
            'IncidentProposal : changement de tenant interdit'
            USING ERRCODE = '23514';
    END IF;


    IF NEW."reviewedById" IS NOT NULL THEN
        SELECT u."tenantId"
        INTO v_tenant
        FROM "User" u
        WHERE u."id" = NEW."reviewedById"
        FOR SHARE;

        IF NOT FOUND
           OR v_tenant IS DISTINCT FROM NEW."tenantId"
        THEN
            RAISE EXCEPTION
                'IncidentProposal : validateur inter-tenant'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW."incidentId" IS NOT NULL THEN
        SELECT i."tenantId"
        INTO v_tenant
        FROM "Incident" i
        WHERE i."id" = NEW."incidentId"
        FOR SHARE;

        IF NOT FOUND
           OR v_tenant IS DISTINCT FROM NEW."tenantId"
        THEN
            RAISE EXCEPTION
                'IncidentProposal : incident inter-tenant'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$guard$;

CREATE TRIGGER "IncidentProposal_tenant_guard"
BEFORE INSERT OR UPDATE OF
    "tenantId", "reviewedById", "incidentId"
ON "IncidentProposal"
FOR EACH ROW
EXECUTE FUNCTION incident_proposal_tenant_guard();

-- Protection 2 :
-- Un utilisateur deja validateur ne peut pas
-- etre deplace vers un tenant incompatible.

CREATE FUNCTION incident_proposal_reviewer_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $guard$
BEGIN
    IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
       AND EXISTS (
           SELECT 1
           FROM "IncidentProposal" p
           WHERE p."reviewedById" = NEW."id"
             AND p."tenantId" IS DISTINCT FROM NEW."tenantId"
       )
    THEN
        RAISE EXCEPTION
            'User : propositions incompatibles avec tenant'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$guard$;

CREATE TRIGGER "User_incident_proposal_reviewer_guard"
BEFORE UPDATE OF "tenantId"
ON "User"
FOR EACH ROW
EXECUTE FUNCTION incident_proposal_reviewer_guard();

-- Protection 3 :
-- Un incident rattache a une proposition
-- ne peut pas etre deplace vers un autre tenant.

CREATE FUNCTION incident_proposal_incident_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $guard$
BEGIN
    IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
       AND EXISTS (
           SELECT 1
           FROM "IncidentProposal" p
           WHERE p."incidentId" = NEW."id"
             AND p."tenantId" IS DISTINCT FROM NEW."tenantId"
       )
    THEN
        RAISE EXCEPTION
            'Incident : proposition incompatible avec tenant'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$guard$;

CREATE TRIGGER "Incident_incident_proposal_guard"
BEFORE UPDATE OF "tenantId"
ON "Incident"
FOR EACH ROW
EXECUTE FUNCTION incident_proposal_incident_guard();
