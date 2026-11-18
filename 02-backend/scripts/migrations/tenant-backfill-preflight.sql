-- OpenCrisis - Backfill multitenant
-- Phase 1 : precontrole strict, lecture seule.
--
-- Precondition :
--   une table temporaire tenant_backfill_mapping
--   contenant entity_type, entity_id, tenant_id.
--
-- Ce script ne modifie aucune donnee metier.
-- Il doit etre execute dans une transaction
-- sur une copie isolee, apres validation humaine
-- du manifeste des correspondances.
--
-- Les tags historiques partages entre tenants
-- doivent faire l'objet d'une procedure de copie
-- distincte. Ce precontrole les refuse.

DO $preflight$
DECLARE
    v_issue TEXT;
BEGIN
    IF to_regclass('pg_temp.tenant_backfill_mapping')
       IS NULL THEN
        RAISE EXCEPTION
            'Manifeste temporaire absent'
            USING ERRCODE = '23514';
    END IF;

    -- Refuser les doublons du manifeste.
    IF EXISTS (
        SELECT 1
        FROM pg_temp.tenant_backfill_mapping
        GROUP BY entity_type, entity_id
        HAVING COUNT(*) <> 1
    ) THEN
        RAISE EXCEPTION
            'Correspondances dupliquees'
            USING ERRCODE = '23514';
    END IF;

    -- Les types et entreprises doivent etre valides.
    IF EXISTS (
        SELECT 1
        FROM pg_temp.tenant_backfill_mapping m
        LEFT JOIN "Tenant" t ON t."id" = m.tenant_id
        WHERE m.entity_type NOT IN (
            'User','Incident','Role','Document',
            'Contact','AuditLog','Tag'
        )
        OR m.entity_id IS NULL
        OR m.tenant_id IS NULL
        OR t."id" IS NULL
        OR t."isActive" IS DISTINCT FROM TRUE
    ) THEN
        RAISE EXCEPTION
            'Type ou entreprise de destination invalide'
            USING ERRCODE = '23514';
    END IF;

    -- Tous les enregistrements historiques
    -- exigeant un tenant doivent etre couverts.
    WITH required AS (
        SELECT 'User' AS kind, "id"
        FROM "User" WHERE "tenantId" IS NULL

        UNION ALL
        SELECT 'Incident', "id"
        FROM "Incident" WHERE "tenantId" IS NULL

        UNION ALL
        SELECT 'Role', "id"
        FROM "Role"
        WHERE "tenantId" IS NULL
          AND "isSystem" = false

        UNION ALL
        SELECT 'Document', "id"
        FROM "Document" WHERE "tenantId" IS NULL

        UNION ALL
        SELECT 'Contact', "id"
        FROM "Contact" WHERE "tenantId" IS NULL

        UNION ALL
        SELECT 'AuditLog', "id"
        FROM "AuditLog" WHERE "tenantId" IS NULL

        UNION ALL
        SELECT 'Tag', "id"
        FROM "Tag" WHERE "tenantId" IS NULL
    )
    SELECT r.kind || ':' || r."id"
    INTO v_issue
    FROM required r
    LEFT JOIN pg_temp.tenant_backfill_mapping m
      ON m.entity_type = r.kind
     AND m.entity_id = r."id"
    WHERE m.entity_id IS NULL
    LIMIT 1;

    IF v_issue IS NOT NULL THEN
        RAISE EXCEPTION
            'Correspondance manquante : %', v_issue
            USING ERRCODE = '23514';
    END IF;

    -- Une ligne du manifeste doit exister en base
    -- et ne doit pas contredire un tenant deja fixe.
    WITH current_rows AS (
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
    INTO v_issue
    FROM pg_temp.tenant_backfill_mapping m
    LEFT JOIN current_rows r
      ON r.kind = m.entity_type
     AND r."id" = m.entity_id
    WHERE r."id" IS NULL
       OR (
           r.tid IS NOT NULL
           AND r.tid IS DISTINCT FROM m.tenant_id
       )
    LIMIT 1;

    IF v_issue IS NOT NULL THEN
        RAISE EXCEPTION
            'Correspondance inexistante ou conflictuelle : %',
            v_issue
            USING ERRCODE = '23514';
    END IF;

    -- Construire les destinations effectives :
    -- valeur du manifeste prioritaire,
    -- sinon tenant deja attribue.
    CREATE TEMP TABLE backfill_effective
    ON COMMIT DROP AS
    WITH all_entities AS (
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
    SELECT
        e.kind,
        e."id",
        COALESCE(m.tenant_id, e.tid) AS tenant_id
    FROM all_entities e
    LEFT JOIN pg_temp.tenant_backfill_mapping m
      ON m.entity_type = e.kind
     AND m.entity_id = e."id";

    CREATE UNIQUE INDEX
    ON backfill_effective(kind, "id");

    -- Incident et createur.
    SELECT 'Incident:' || i."id"
    INTO v_issue
    FROM "Incident" i
    JOIN backfill_effective im
      ON im.kind = 'Incident' AND im."id" = i."id"
    LEFT JOIN backfill_effective um
      ON um.kind = 'User' AND um."id" = i."createdById"
    WHERE im.tenant_id IS DISTINCT FROM um.tenant_id
    LIMIT 1;

    IF v_issue IS NOT NULL THEN
        RAISE EXCEPTION 'Createur incoherent : %', v_issue
            USING ERRCODE = '23514';
    END IF;

    -- Role personnalise et utilisateur.
    SELECT 'RoleAssignment:' || a."id"
    INTO v_issue
    FROM "RoleAssignment" a
    JOIN "Role" r ON r."id" = a."roleId"
    JOIN backfill_effective rm
      ON rm.kind = 'Role' AND rm."id" = r."id"
    LEFT JOIN backfill_effective um
      ON um.kind = 'User' AND um."id" = a."userId"
    WHERE (
        r."isSystem" = false
        AND rm.tenant_id IS DISTINCT FROM um.tenant_id
    ) OR (
        r."isSystem" = true
        AND r."tenantId" IS NOT NULL
    )
    LIMIT 1;

    IF v_issue IS NOT NULL THEN
        RAISE EXCEPTION 'Role incoherent : %', v_issue
            USING ERRCODE = '23514';
    END IF;

    -- Evenements et acteurs.
    SELECT 'TimelineEvent:' || e."id"
    INTO v_issue
    FROM "TimelineEvent" e
    JOIN backfill_effective im
      ON im.kind = 'Incident'
     AND im."id" = e."incidentId"
    LEFT JOIN backfill_effective um
      ON um.kind = 'User'
     AND um."id" = e."actorId"
    WHERE e."actorId" IS NOT NULL
      AND im.tenant_id IS DISTINCT FROM um.tenant_id
    LIMIT 1;

    IF v_issue IS NOT NULL THEN
        RAISE EXCEPTION 'Evenement incoherent : %', v_issue
            USING ERRCODE = '23514';
    END IF;

    -- Main courante et auteurs.
    SELECT 'LogEntry:' || l."id"
    INTO v_issue
    FROM "LogEntry" l
    JOIN backfill_effective im
      ON im.kind = 'Incident'
     AND im."id" = l."incidentId"
    LEFT JOIN backfill_effective am
      ON am.kind = 'User' AND am."id" = l."authorId"
    LEFT JOIN backfill_effective em
      ON em.kind = 'User' AND em."id" = l."editedById"
    WHERE im.tenant_id IS DISTINCT FROM am.tenant_id
       OR (
           l."editedById" IS NOT NULL
           AND im.tenant_id IS DISTINCT FROM em.tenant_id
       )
    LIMIT 1;

    IF v_issue IS NOT NULL THEN
        RAISE EXCEPTION 'Main courante incoherente : %', v_issue
            USING ERRCODE = '23514';
    END IF;

    -- Documents : auteur, incident, evenement.
    SELECT 'Document:' || d."id"
    INTO v_issue
    FROM "Document" d
    JOIN backfill_effective dm
      ON dm.kind = 'Document' AND dm."id" = d."id"
    LEFT JOIN backfill_effective um
      ON um.kind = 'User' AND um."id" = d."uploadedById"
    LEFT JOIN backfill_effective im
      ON im.kind = 'Incident' AND im."id" = d."incidentId"
    LEFT JOIN "TimelineEvent" e
      ON e."id" = d."timelineEventId"
    WHERE dm.tenant_id IS DISTINCT FROM um.tenant_id
       OR (
           d."incidentId" IS NOT NULL
           AND dm.tenant_id IS DISTINCT FROM im.tenant_id
       )
       OR (
           d."timelineEventId" IS NOT NULL
           AND (
               d."incidentId" IS NULL
               OR e."incidentId" IS DISTINCT FROM d."incidentId"
           )
       )
    LIMIT 1;

    IF v_issue IS NOT NULL THEN
        RAISE EXCEPTION 'Document incoherent : %', v_issue
            USING ERRCODE = '23514';
    END IF;

    -- Contacts et createurs.
    SELECT 'Contact:' || c."id"
    INTO v_issue
    FROM "Contact" c
    JOIN backfill_effective cm
      ON cm.kind = 'Contact' AND cm."id" = c."id"
    LEFT JOIN backfill_effective um
      ON um.kind = 'User' AND um."id" = c."createdById"
    WHERE cm.tenant_id IS DISTINCT FROM um.tenant_id
    LIMIT 1;

    IF v_issue IS NOT NULL THEN
        RAISE EXCEPTION 'Contact incoherent : %', v_issue
            USING ERRCODE = '23514';
    END IF;

    -- IoC et createurs.
    SELECT 'IoC:' || c."id"
    INTO v_issue
    FROM "IoC" c
    JOIN "TimelineEvent" e
      ON e."id" = c."timelineEventId"
    JOIN backfill_effective im
      ON im.kind = 'Incident' AND im."id" = e."incidentId"
    LEFT JOIN backfill_effective um
      ON um.kind = 'User' AND um."id" = c."createdById"
    WHERE im.tenant_id IS DISTINCT FROM um.tenant_id
    LIMIT 1;

    IF v_issue IS NOT NULL THEN
        RAISE EXCEPTION 'IoC incoherent : %', v_issue
            USING ERRCODE = '23514';
    END IF;

    -- Audits avec utilisateur et/ou incident.
    SELECT 'AuditLog:' || a."id"
    INTO v_issue
    FROM "AuditLog" a
    JOIN backfill_effective am
      ON am.kind = 'AuditLog' AND am."id" = a."id"
    LEFT JOIN backfill_effective um
      ON um.kind = 'User' AND um."id" = a."userId"
    LEFT JOIN backfill_effective im
      ON im.kind = 'Incident' AND im."id" = a."incidentId"
    WHERE (
        a."userId" IS NOT NULL
        AND am.tenant_id IS DISTINCT FROM um.tenant_id
    ) OR (
        a."incidentId" IS NOT NULL
        AND am.tenant_id IS DISTINCT FROM im.tenant_id
    )
    LIMIT 1;

    IF v_issue IS NOT NULL THEN
        RAISE EXCEPTION 'Audit incoherent : %', v_issue
            USING ERRCODE = '23514';
    END IF;

    -- Tags et main courante.
    SELECT 'LogEntryTag:' || lt."logEntryId"
    INTO v_issue
    FROM "LogEntryTag" lt
    JOIN "LogEntry" l
      ON l."id" = lt."logEntryId"
    JOIN backfill_effective im
      ON im.kind = 'Incident'
     AND im."id" = l."incidentId"
    LEFT JOIN backfill_effective tm
      ON tm.kind = 'Tag' AND tm."id" = lt."tagId"
    WHERE im.tenant_id IS DISTINCT FROM tm.tenant_id
    LIMIT 1;

    IF v_issue IS NOT NULL THEN
        RAISE EXCEPTION
            'Tag partage ou incoherent : %', v_issue
            USING ERRCODE = '23514';
    END IF;

    RAISE NOTICE
        'PREFLIGHT OK : correspondances et relations coherentes';
END;
$preflight$;
