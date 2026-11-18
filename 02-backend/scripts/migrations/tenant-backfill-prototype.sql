-- OpenCrisis - Prototype de reprise historique.
--
-- INTERDIT EN PRODUCTION.
-- Executable seulement sur une base fictive vm129cr.
--
-- Precondition :
-- table temporaire tenant_backfill_mapping
-- avec entity_type, entity_id, tenant_id
-- et cle primaire (entity_type, entity_id).
--
-- Execution : psql avec ON_ERROR_STOP=1.
-- Toute erreur interrompt l'execution.
-- La deconnexion annule une transaction ouverte.

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '60s';

-- Limitation explicite a l'environnement de test.
DO $guard$
BEGIN
    IF current_database() <> 'vm129cr'
       OR current_user <> 'vm129cr' THEN
        RAISE EXCEPTION
            'Prototype interdit hors base fictive vm129cr'
            USING ERRCODE = '23514';
    END IF;

    IF to_regclass('pg_temp.tenant_backfill_mapping')
       IS NULL THEN
        RAISE EXCEPTION
            'Manifeste de migration absent'
            USING ERRCODE = '23514';
    END IF;
END;
$guard$;

-- Verrouillage global du perimetre.
-- Aucun autre ecrivain ne peut intervenir
-- dans ces tables durant la reprise.
LOCK TABLE
    "Tenant",
    "User",
    "Role",
    "RoleAssignment",
    "RolePermission",
    "Incident",
    "Document",
    "Contact",
    "AuditLog",
    "Tag",
    "LogEntry",
    "LogEntryTag",
    "TimelineEvent",
    "IoC"
IN ACCESS EXCLUSIVE MODE;

-- Verification initiale des protections.
DO $triggers$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_trigger t
        JOIN pg_class c
          ON c.oid = t.tgrelid
        JOIN pg_namespace n
          ON n.oid = c.relnamespace
        WHERE n.nspname = current_schema()
          AND c.relname IN (
              'User','Role','RoleAssignment',
              'Incident','Document','Contact',
              'AuditLog','Tag','LogEntry',
              'LogEntryTag','TimelineEvent','IoC'
          )
          AND NOT t.tgisinternal
          AND t.tgenabled <> 'O'
    ) THEN
        RAISE EXCEPTION
            'Un declencheur metier est deja desactive'
            USING ERRCODE = '23514';
    END IF;
END;
$triggers$;

-- Conserver les volumes initiaux.
CREATE TEMP TABLE backfill_counts
ON COMMIT DROP AS
SELECT 'User' AS entity, count(*) AS total FROM "User"
UNION ALL
SELECT 'Incident', count(*) FROM "Incident"
UNION ALL
SELECT 'Role', count(*) FROM "Role"
UNION ALL
SELECT 'Document', count(*) FROM "Document"
UNION ALL
SELECT 'Contact', count(*) FROM "Contact"
UNION ALL
SELECT 'AuditLog', count(*) FROM "AuditLog"
UNION ALL
SELECT 'Tag', count(*) FROM "Tag"
UNION ALL
SELECT 'RoleAssignment', count(*) FROM "RoleAssignment"
UNION ALL
SELECT 'LogEntry', count(*) FROM "LogEntry"
UNION ALL
SELECT 'TimelineEvent', count(*) FROM "TimelineEvent"
UNION ALL
SELECT 'IoC', count(*) FROM "IoC"
UNION ALL
SELECT 'LogEntryTag', count(*) FROM "LogEntryTag";

-- Premiere verification du manifeste.
\ir tenant-backfill-preflight.sql

-- Suspension temporaire et transactionnelle
-- de protections incompatibles avec le backfill
-- circulaire. Les tables sont verrouillees.
ALTER TABLE "User"
    DISABLE TRIGGER "User_tenant_roles_guard";
ALTER TABLE "User"
    DISABLE TRIGGER "User_document_tenant_guard";
ALTER TABLE "User"
    DISABLE TRIGGER "User_created_incidents_tenant_guard";
ALTER TABLE "User"
    DISABLE TRIGGER "User_contacts_tenant_guard";

ALTER TABLE "Role"
    DISABLE TRIGGER "Role_tenant_assignments_guard";

ALTER TABLE "Incident"
    DISABLE TRIGGER "Incident_document_tenant_guard";
ALTER TABLE "Incident"
    DISABLE TRIGGER "Incident_creator_tenant_guard";

ALTER TABLE "Document"
    DISABLE TRIGGER "Document_tenant_relations_guard";

ALTER TABLE "Contact"
    DISABLE TRIGGER "Contact_tenant_guard";

ALTER TABLE "Tag"
    DISABLE TRIGGER "Tag_tenant_guard";

-- Rattacher uniquement les lignes explicitement
-- presentes dans le manifeste valide.
UPDATE "User" e
SET "tenantId" = m.tenant_id
FROM pg_temp.tenant_backfill_mapping m
WHERE m.entity_type = 'User'
  AND m.entity_id = e."id"
  AND e."tenantId" IS DISTINCT FROM m.tenant_id;

UPDATE "Role" e
SET "tenantId" = m.tenant_id
FROM pg_temp.tenant_backfill_mapping m
WHERE m.entity_type = 'Role'
  AND m.entity_id = e."id"
  AND e."tenantId" IS DISTINCT FROM m.tenant_id;

UPDATE "Incident" e
SET "tenantId" = m.tenant_id
FROM pg_temp.tenant_backfill_mapping m
WHERE m.entity_type = 'Incident'
  AND m.entity_id = e."id"
  AND e."tenantId" IS DISTINCT FROM m.tenant_id;

UPDATE "Document" e
SET "tenantId" = m.tenant_id
FROM pg_temp.tenant_backfill_mapping m
WHERE m.entity_type = 'Document'
  AND m.entity_id = e."id"
  AND e."tenantId" IS DISTINCT FROM m.tenant_id;

UPDATE "Contact" e
SET "tenantId" = m.tenant_id
FROM pg_temp.tenant_backfill_mapping m
WHERE m.entity_type = 'Contact'
  AND m.entity_id = e."id"
  AND e."tenantId" IS DISTINCT FROM m.tenant_id;

UPDATE "AuditLog" e
SET "tenantId" = m.tenant_id
FROM pg_temp.tenant_backfill_mapping m
WHERE m.entity_type = 'AuditLog'
  AND m.entity_id = e."id"
  AND e."tenantId" IS DISTINCT FROM m.tenant_id;

UPDATE "Tag" e
SET "tenantId" = m.tenant_id
FROM pg_temp.tenant_backfill_mapping m
WHERE m.entity_type = 'Tag'
  AND m.entity_id = e."id"
  AND e."tenantId" IS DISTINCT FROM m.tenant_id;

-- Restaurer les protections avant le COMMIT.
ALTER TABLE "Tag"
    ENABLE TRIGGER "Tag_tenant_guard";
ALTER TABLE "Contact"
    ENABLE TRIGGER "Contact_tenant_guard";
ALTER TABLE "Document"
    ENABLE TRIGGER "Document_tenant_relations_guard";

ALTER TABLE "Incident"
    ENABLE TRIGGER "Incident_creator_tenant_guard";
ALTER TABLE "Incident"
    ENABLE TRIGGER "Incident_document_tenant_guard";

ALTER TABLE "Role"
    ENABLE TRIGGER "Role_tenant_assignments_guard";

ALTER TABLE "User"
    ENABLE TRIGGER "User_contacts_tenant_guard";
ALTER TABLE "User"
    ENABLE TRIGGER "User_created_incidents_tenant_guard";
ALTER TABLE "User"
    ENABLE TRIGGER "User_document_tenant_guard";
ALTER TABLE "User"
    ENABLE TRIGGER "User_tenant_roles_guard";

-- Le controle de reprise doit maintenant passer
-- sur les valeurs effectivement ecrites.
DROP TABLE pg_temp.backfill_effective;

\ir tenant-backfill-preflight.sql

DO $final$
DECLARE
    v_difference TEXT;
BEGIN
    -- Aucune ligne du manifeste ne doit diverger.
    WITH actual AS (
        SELECT 'User' AS kind, "id", "tenantId" AS tid
        FROM "User"
        UNION ALL SELECT 'Incident', "id", "tenantId"
        FROM "Incident"
        UNION ALL SELECT 'Role', "id", "tenantId"
        FROM "Role"
        UNION ALL SELECT 'Document', "id", "tenantId"
        FROM "Document"
        UNION ALL SELECT 'Contact', "id", "tenantId"
        FROM "Contact"
        UNION ALL SELECT 'AuditLog', "id", "tenantId"
        FROM "AuditLog"
        UNION ALL SELECT 'Tag', "id", "tenantId"
        FROM "Tag"
    )
    SELECT m.entity_type || ':' || m.entity_id
    INTO v_difference
    FROM pg_temp.tenant_backfill_mapping m
    LEFT JOIN actual a
      ON a.kind = m.entity_type
     AND a."id" = m.entity_id
    WHERE a.tid IS DISTINCT FROM m.tenant_id
    LIMIT 1;

    IF v_difference IS NOT NULL THEN
        RAISE EXCEPTION
            'Rattachement non conforme : %', v_difference
            USING ERRCODE = '23514';
    END IF;

    -- Comparaison explicite dans les deux sens.
    IF EXISTS (
        SELECT 1
        FROM backfill_counts b
        FULL OUTER JOIN (
            SELECT 'User' AS entity, count(*) AS total FROM "User"
            UNION ALL SELECT 'Incident', count(*) FROM "Incident"
            UNION ALL SELECT 'Role', count(*) FROM "Role"
            UNION ALL SELECT 'Document', count(*) FROM "Document"
            UNION ALL SELECT 'Contact', count(*) FROM "Contact"
            UNION ALL SELECT 'AuditLog', count(*) FROM "AuditLog"
            UNION ALL SELECT 'Tag', count(*) FROM "Tag"
            UNION ALL SELECT 'RoleAssignment', count(*) FROM "RoleAssignment"
            UNION ALL SELECT 'LogEntry', count(*) FROM "LogEntry"
            UNION ALL SELECT 'TimelineEvent', count(*) FROM "TimelineEvent"
            UNION ALL SELECT 'IoC', count(*) FROM "IoC"
            UNION ALL SELECT 'LogEntryTag', count(*) FROM "LogEntryTag"
        ) a ON a.entity = b.entity
        WHERE b.entity IS NULL
           OR a.entity IS NULL
           OR b.total IS DISTINCT FROM a.total
    ) THEN
        RAISE EXCEPTION
            'Difference de volume apres reprise'
            USING ERRCODE = '23514';
    END IF;

    -- Tous les triggers metier doivent etre actifs.
    IF EXISTS (
        SELECT 1
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = current_schema()
          AND c.relname IN (
              'User','Role','RoleAssignment',
              'Incident','Document','Contact',
              'AuditLog','Tag','LogEntry',
              'LogEntryTag','TimelineEvent','IoC'
          )
          AND NOT t.tgisinternal
          AND t.tgenabled <> 'O'
    ) THEN
        RAISE EXCEPTION
            'Declencheur desactive avant commit'
            USING ERRCODE = '23514';
    END IF;

    RAISE NOTICE
        'BACKFILL OK : correspondances et protections verifiees';
END;
$final$;

COMMIT;
