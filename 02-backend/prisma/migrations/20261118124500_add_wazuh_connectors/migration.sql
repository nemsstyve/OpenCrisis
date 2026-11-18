-- OpenCrisis : identites des connecteurs Wazuh.
-- Migration additive, aucune donnee historique supprimee.

CREATE TABLE "WazuhConnector" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "secretHash" VARCHAR(64) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL
        DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WazuhConnector_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "WazuhConnector_secretHash_check"
        CHECK ("secretHash" ~ '^[0-9a-f]{64}$'),

    CONSTRAINT "WazuhConnector_revocation_check"
        CHECK (
            "revokedAt" IS NULL
            OR "isActive" = false
        )
);

CREATE UNIQUE INDEX
    "WazuhConnector_tenantId_sourceId_key"
ON "WazuhConnector"("tenantId", "sourceId");

CREATE INDEX
    "WazuhConnector_tenantId_isActive_idx"
ON "WazuhConnector"("tenantId", "isActive");

ALTER TABLE "WazuhConnector"
ADD CONSTRAINT "WazuhConnector_tenantId_fkey"
FOREIGN KEY ("tenantId")
REFERENCES "Tenant"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

-- Identite d'origine immuable.
-- Revocation irreversible pour un identifiant donne.

CREATE FUNCTION wazuh_connector_identity_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $guard$
BEGIN
    IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
       OR NEW."sourceId" IS DISTINCT FROM OLD."sourceId"
    THEN
        RAISE EXCEPTION
            'WazuhConnector : identite immuable'
            USING ERRCODE = '23514';
    END IF;

    IF OLD."revokedAt" IS NOT NULL
       AND (
           NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt"
           OR NEW."isActive" IS DISTINCT FROM false
       )
    THEN
        RAISE EXCEPTION
            'WazuhConnector : revocation definitive'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$guard$;

CREATE TRIGGER "WazuhConnector_identity_guard"
BEFORE UPDATE ON "WazuhConnector"
FOR EACH ROW
EXECUTE FUNCTION wazuh_connector_identity_guard();
