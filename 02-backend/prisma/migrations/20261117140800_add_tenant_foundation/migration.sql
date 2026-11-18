-- Fondation multi-tenant.
-- Aucun rattachement automatique des anciennes donnees.

CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Tenant_slug_key"
    ON "Tenant"("slug");

ALTER TABLE "User"
    ADD COLUMN "tenantId" TEXT;

ALTER TABLE "Incident"
    ADD COLUMN "tenantId" TEXT;

CREATE INDEX "User_tenantId_idx"
    ON "User"("tenantId");

CREATE INDEX "Incident_tenantId_idx"
    ON "Incident"("tenantId");

ALTER TABLE "User"
    ADD CONSTRAINT "User_tenantId_fkey"
    FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;

ALTER TABLE "Incident"
    ADD CONSTRAINT "Incident_tenantId_fkey"
    FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;


-- Isolation des documents et de la bibliotheque generale.
-- Champ nullable uniquement pendant la migration progressive.

ALTER TABLE "Document"
    ADD COLUMN "tenantId" TEXT;

CREATE INDEX "Document_tenantId_incidentId_idx"
    ON "Document"("tenantId", "incidentId");

ALTER TABLE "Document"
    ADD CONSTRAINT "Document_tenantId_fkey"
    FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;


-- Isolation des roles et des journaux d'audit.
-- Les champs restent nullable pendant la transition.

ALTER TABLE "Role"
    ADD COLUMN "tenantId" TEXT;

CREATE INDEX "Role_tenantId_idx"
    ON "Role"("tenantId");

ALTER TABLE "Role"
    ADD CONSTRAINT "Role_tenantId_fkey"
    FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;

ALTER TABLE "AuditLog"
    ADD COLUMN "tenantId" TEXT;

CREATE INDEX "AuditLog_tenantId_createdAt_idx"
    ON "AuditLog"("tenantId", "createdAt");

ALTER TABLE "AuditLog"
    ADD CONSTRAINT "AuditLog_tenantId_fkey"
    FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;


-- VM115C : unicite multitenant des roles.
-- L'ancienne unicite globale est remplacee.

DROP INDEX "Role_name_key";

CREATE UNIQUE INDEX "Role_tenantId_name_key"
    ON "Role"("tenantId", "name");

CREATE UNIQUE INDEX "Role_system_global_name_key"
    ON "Role"("name")
    WHERE "tenantId" IS NULL AND "isSystem" = true;

-- NOT VALID protege les nouvelles ecritures.
-- Les donnees historiques seront controlees
-- avant validation definitive de la contrainte.

ALTER TABLE "Role"
    ADD CONSTRAINT "Role_tenant_consistency_check"
    CHECK (
        ("isSystem" = true AND "tenantId" IS NULL)
        OR
        ("isSystem" = false AND "tenantId" IS NOT NULL)
    ) NOT VALID;

-- VM119C : integrite des attributions multitenant.
-- Les roles systeme globaux sont partageables.
-- Les roles personnalises doivent appartenir au
-- meme tenant que leur utilisateur.
-- Les locks empechent les changements concurrents
-- de rendre une attribution incoherente.

CREATE OR REPLACE FUNCTION
"check_role_assignment_tenant"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_tenant TEXT;
    v_role_tenant TEXT;
    v_role_system BOOLEAN;
BEGIN
    -- Verrouiller les deux parents pendant la transaction.
    SELECT u."tenantId"
    INTO v_user_tenant
    FROM "User" u
    WHERE u."id" = NEW."userId"
    FOR SHARE;

    IF NOT FOUND OR v_user_tenant IS NULL THEN
        RAISE EXCEPTION
            'Utilisateur sans tenant valide'
            USING ERRCODE = '23514';
    END IF;

    SELECT r."tenantId", r."isSystem"
    INTO v_role_tenant, v_role_system
    FROM "Role" r
    WHERE r."id" = NEW."roleId"
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Role introuvable'
            USING ERRCODE = '23514';
    END IF;

    IF NOT (
        (v_role_system = true AND v_role_tenant IS NULL)
        OR
        (v_role_system = false
         AND v_role_tenant = v_user_tenant)
    ) THEN
        RAISE EXCEPTION
            'Attribution de role inter-tenant interdite'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "RoleAssignment_tenant_guard"
BEFORE INSERT OR UPDATE OF "userId", "roleId"
ON "RoleAssignment"
FOR EACH ROW
EXECUTE FUNCTION "check_role_assignment_tenant"();


-- Un utilisateur ne peut pas changer de tenant
-- si ses roles actuels deviendraient incompatibles.

CREATE OR REPLACE FUNCTION
"check_user_tenant_role_assignments"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW."tenantId" IS NOT DISTINCT FROM
       OLD."tenantId" THEN
        RETURN NEW;
    END IF;

    -- Les roles verrouilles ne peuvent pas changer
    -- pendant cette verification.
    PERFORM r."id"
    FROM "Role" r
    JOIN "RoleAssignment" a
      ON a."roleId" = r."id"
    WHERE a."userId" = NEW."id"
    ORDER BY r."id"
    FOR SHARE OF r;

    IF EXISTS (
        SELECT 1
        FROM "RoleAssignment" a
        JOIN "Role" r ON r."id" = a."roleId"
        WHERE a."userId" = NEW."id"
          AND (
            NEW."tenantId" IS NULL
            OR NOT (
              (r."isSystem" = true
               AND r."tenantId" IS NULL)
              OR
              (r."isSystem" = false
               AND r."tenantId" = NEW."tenantId")
            )
          )
    ) THEN
        RAISE EXCEPTION
            'Changement de tenant utilisateur incompatible'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "User_tenant_roles_guard"
BEFORE UPDATE OF "tenantId"
ON "User"
FOR EACH ROW
EXECUTE FUNCTION "check_user_tenant_role_assignments"();


-- Un role ne peut pas changer de tenant ou de
-- nature si ses attributions deviendraient invalides.

CREATE OR REPLACE FUNCTION
"check_role_tenant_user_assignments"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW."tenantId" IS NOT DISTINCT FROM
       OLD."tenantId"
       AND NEW."isSystem" IS NOT DISTINCT FROM
       OLD."isSystem" THEN
        RETURN NEW;
    END IF;

    -- Verrouiller les utilisateurs concernes.
    PERFORM u."id"
    FROM "User" u
    JOIN "RoleAssignment" a
      ON a."userId" = u."id"
    WHERE a."roleId" = NEW."id"
    ORDER BY u."id"
    FOR SHARE OF u;

    IF EXISTS (
        SELECT 1
        FROM "RoleAssignment" a
        JOIN "User" u ON u."id" = a."userId"
        WHERE a."roleId" = NEW."id"
          AND (
            u."tenantId" IS NULL
            OR NOT (
              (NEW."isSystem" = true
               AND NEW."tenantId" IS NULL)
              OR
              (NEW."isSystem" = false
               AND NEW."tenantId" = u."tenantId")
            )
          )
    ) THEN
        RAISE EXCEPTION
            'Changement de tenant role incompatible'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "Role_tenant_assignments_guard"
BEFORE UPDATE OF "tenantId", "isSystem"
ON "Role"
FOR EACH ROW
EXECUTE FUNCTION "check_role_tenant_user_assignments"();


-- VM121 : isolation des associations documentaires.
--
-- Les nouvelles ecritures doivent posseder un tenant.
-- Les documents historiques restent inchanges jusqu'au backfill.
-- Les lignes parentes sont verrouillees contre les changements
-- concurrents pendant la verification.

CREATE OR REPLACE FUNCTION
"check_document_tenant_relations"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_tenant TEXT;
    v_incident_tenant TEXT;
    v_event_incident TEXT;
BEGIN
    IF NEW."tenantId" IS NULL THEN
        RAISE EXCEPTION
            'Document sans tenant interdit'
            USING ERRCODE = '23514';
    END IF;

    -- Le proprietaire du fichier doit appartenir au tenant.

    SELECT u."tenantId"
    INTO v_user_tenant
    FROM "User" u
    WHERE u."id" = NEW."uploadedById"
      AND u."deletedAt" IS NULL
      AND u."isActive" = true
    FOR SHARE;

    IF NOT FOUND OR
       v_user_tenant IS DISTINCT FROM NEW."tenantId" THEN
        RAISE EXCEPTION
            'Utilisateur et document de tenants differents'
            USING ERRCODE = '23514';
    END IF;

    -- Un document sans incident est autorise
    -- dans la bibliotheque generale.

    IF NEW."incidentId" IS NOT NULL THEN
        SELECT i."tenantId"
        INTO v_incident_tenant
        FROM "Incident" i
        WHERE i."id" = NEW."incidentId"
          AND i."deletedAt" IS NULL
        FOR SHARE;

        IF NOT FOUND OR
           v_incident_tenant IS DISTINCT FROM NEW."tenantId" THEN
            RAISE EXCEPTION
                'Incident et document de tenants differents'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    -- Un document lie a un evenement doit egalement
    -- etre lie a l'incident de cet evenement.

    IF NEW."timelineEventId" IS NOT NULL THEN
        IF NEW."incidentId" IS NULL THEN
            RAISE EXCEPTION
                'Incident requis pour evenement documentaire'
                USING ERRCODE = '23514';
        END IF;

        SELECT e."incidentId"
        INTO v_event_incident
        FROM "TimelineEvent" e
        WHERE e."id" = NEW."timelineEventId"
          AND e."deletedAt" IS NULL
        FOR SHARE;

        IF NOT FOUND OR
           v_event_incident IS DISTINCT FROM NEW."incidentId" THEN
            RAISE EXCEPTION
                'Evenement et document lies a des incidents differents'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "Document_tenant_relations_guard"
BEFORE INSERT OR UPDATE OF
    "tenantId",
    "incidentId",
    "timelineEventId",
    "uploadedById"
ON "Document"
FOR EACH ROW
EXECUTE FUNCTION "check_document_tenant_relations"();


-- VM122 : protection des modifications des parents
-- auxquels des documents sont deja rattaches.
--
-- Les controles sont executes dans la transaction
-- qui modifie le parent. Le declencheur Document
-- existant verrouille ses parents FOR SHARE.
--
-- Les deux directions devront egalement etre
-- testees sous concurrence.

CREATE OR REPLACE FUNCTION
"guard_incident_document_tenant"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW."tenantId" IS NOT DISTINCT FROM
       OLD."tenantId" THEN
        RETURN NEW;
    END IF;

    -- Documents rattaches a cet incident.
    IF EXISTS (
        SELECT 1
        FROM "Document" d
        WHERE d."incidentId" = NEW."id"
          AND d."tenantId"
              IS DISTINCT FROM NEW."tenantId"
    ) THEN
        RAISE EXCEPTION
            'Changement tenant incident incompatible avec documents'
            USING ERRCODE = '23514';
    END IF;

    -- Acteurs des evenements deja rattaches.
    IF EXISTS (
        SELECT 1
        FROM "TimelineEvent" e
        LEFT JOIN "User" u
          ON u."id" = e."actorId"
        WHERE e."incidentId" = NEW."id"
          AND e."actorId" IS NOT NULL
          AND u."tenantId"
              IS DISTINCT FROM NEW."tenantId"
    ) THEN
        RAISE EXCEPTION
            'Changement tenant incident incompatible avec acteurs'
            USING ERRCODE = '23514';
    END IF;

    -- Auteurs et editeurs des entrees de main courante.
    IF EXISTS (
        SELECT 1
        FROM "LogEntry" l
        LEFT JOIN "User" author_user
          ON author_user."id" = l."authorId"
        LEFT JOIN "User" editor_user
          ON editor_user."id" = l."editedById"
        WHERE l."incidentId" = NEW."id"
          AND (
              author_user."tenantId"
                  IS DISTINCT FROM NEW."tenantId"
              OR (
                  l."editedById" IS NOT NULL
                  AND editor_user."tenantId"
                      IS DISTINCT FROM NEW."tenantId"
              )
          )
    ) THEN
        RAISE EXCEPTION
            'Changement tenant incident incompatible avec main courante'
            USING ERRCODE = '23514';
    END IF;

    -- Createurs des IoC des evenements de cet incident.
    IF EXISTS (
        SELECT 1
        FROM "IoC" c
        JOIN "TimelineEvent" e
          ON e."id" = c."timelineEventId"
        LEFT JOIN "User" u
          ON u."id" = c."createdById"
        WHERE e."incidentId" = NEW."id"
          AND u."tenantId"
              IS DISTINCT FROM NEW."tenantId"
    ) THEN
        RAISE EXCEPTION
            'Changement tenant incident incompatible avec IoC'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "Incident_document_tenant_guard"
BEFORE UPDATE OF "tenantId"
ON "Incident"
FOR EACH ROW
EXECUTE FUNCTION "guard_incident_document_tenant"();


CREATE OR REPLACE FUNCTION
"guard_user_document_tenant"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW."tenantId" IS NOT DISTINCT FROM
       OLD."tenantId" THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "Document" d
        WHERE d."uploadedById" = NEW."id"
          AND d."tenantId"
              IS DISTINCT FROM NEW."tenantId"
    ) THEN
        RAISE EXCEPTION
            'Changement de tenant utilisateur incompatible avec documents'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "User_document_tenant_guard"
BEFORE UPDATE OF "tenantId"
ON "User"
FOR EACH ROW
EXECUTE FUNCTION "guard_user_document_tenant"();


CREATE OR REPLACE FUNCTION
"guard_event_document_incident"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_destination_tenant TEXT;
BEGIN
    IF NEW."incidentId" IS NOT DISTINCT FROM
       OLD."incidentId" THEN
        RETURN NEW;
    END IF;

    -- Conserver la coherence des documents existants.
    IF EXISTS (
        SELECT 1
        FROM "Document" d
        WHERE d."timelineEventId" = NEW."id"
          AND d."incidentId"
              IS DISTINCT FROM NEW."incidentId"
    ) THEN
        RAISE EXCEPTION
            'Changement incident evenement incompatible avec documents'
            USING ERRCODE = '23514';
    END IF;

    -- Recuperer le tenant du nouvel incident.
    -- La fonction de validation de l'evenement
    -- controle aussi cette destination.
    SELECT i."tenantId"
    INTO v_destination_tenant
    FROM "Incident" i
    WHERE i."id" = NEW."incidentId"
    FOR SHARE;

    IF NOT FOUND OR v_destination_tenant IS NULL THEN
        RAISE EXCEPTION
            'Incident de destination sans tenant'
            USING ERRCODE = '23514';
    END IF;

    -- Les createurs des IoC deja rattaches a
    -- cet evenement doivent rester dans le tenant.
    IF EXISTS (
        SELECT 1
        FROM "IoC" c
        LEFT JOIN "User" u
          ON u."id" = c."createdById"
        WHERE c."timelineEventId" = NEW."id"
          AND u."tenantId"
              IS DISTINCT FROM v_destination_tenant
    ) THEN
        RAISE EXCEPTION
            'Deplacement evenement incompatible avec IoC'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "TimelineEvent_document_incident_guard"
BEFORE UPDATE OF "incidentId"
ON "TimelineEvent"
FOR EACH ROW
EXECUTE FUNCTION "guard_event_document_incident"();
-- VM126D : integrite entre incidents et leurs createurs.
-- Ces controles concernent les nouvelles ecritures.
-- Les donnees historiques necessitent un audit distinct.

CREATE OR REPLACE FUNCTION
"check_incident_creator_tenant"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_creator_tenant TEXT;
BEGIN
    -- Une ecriture d'incident doit avoir un tenant connu.
    IF NEW."tenantId" IS NULL THEN
        RAISE EXCEPTION
            'Incident sans tenant interdit'
            USING ERRCODE = '23514';
    END IF;

    -- Verrouille le createur pour synchroniser
    -- la verification avec ses changements de tenant.
    SELECT u."tenantId"
    INTO v_creator_tenant
    FROM "User" u
    WHERE u."id" = NEW."createdById"
    FOR SHARE;

    IF NOT FOUND OR
       v_creator_tenant IS DISTINCT FROM NEW."tenantId" THEN
        RAISE EXCEPTION
            'Incident et createur de tenants differents'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "Incident_creator_tenant_guard"
BEFORE INSERT OR UPDATE OF
    "tenantId", "createdById"
ON "Incident"
FOR EACH ROW
EXECUTE FUNCTION "check_incident_creator_tenant"();


CREATE OR REPLACE FUNCTION
"guard_user_created_incidents_tenant"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW."tenantId" IS NOT DISTINCT FROM
       OLD."tenantId" THEN
        RETURN NEW;
    END IF;

    -- Incidents crees par cet utilisateur.
    IF EXISTS (
        SELECT 1
        FROM "Incident" i
        WHERE i."createdById" = NEW."id"
          AND i."tenantId"
              IS DISTINCT FROM NEW."tenantId"
    ) THEN
        RAISE EXCEPTION
            'Changement tenant incompatible avec incidents crees'
            USING ERRCODE = '23514';
    END IF;

    -- Evenements dont cet utilisateur est acteur.
    IF EXISTS (
        SELECT 1
        FROM "TimelineEvent" e
        JOIN "Incident" i
          ON i."id" = e."incidentId"
        WHERE e."actorId" = NEW."id"
          AND i."tenantId"
              IS DISTINCT FROM NEW."tenantId"
    ) THEN
        RAISE EXCEPTION
            'Changement tenant incompatible avec evenements'
            USING ERRCODE = '23514';
    END IF;

    -- Entrees de main courante ecrites ou modifiees.
    IF EXISTS (
        SELECT 1
        FROM "LogEntry" l
        JOIN "Incident" i
          ON i."id" = l."incidentId"
        WHERE (
            l."authorId" = NEW."id"
            OR l."editedById" = NEW."id"
        )
          AND i."tenantId"
              IS DISTINCT FROM NEW."tenantId"
    ) THEN
        RAISE EXCEPTION
            'Changement tenant incompatible avec main courante'
            USING ERRCODE = '23514';
    END IF;

    -- IoC crees par cet utilisateur.
    IF EXISTS (
        SELECT 1
        FROM "IoC" c
        JOIN "TimelineEvent" e
          ON e."id" = c."timelineEventId"
        JOIN "Incident" i
          ON i."id" = e."incidentId"
        WHERE c."createdById" = NEW."id"
          AND i."tenantId"
              IS DISTINCT FROM NEW."tenantId"
    ) THEN
        RAISE EXCEPTION
            'Changement tenant incompatible avec IoC'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "User_created_incidents_tenant_guard"
BEFORE UPDATE OF "tenantId"
ON "User"
FOR EACH ROW
EXECUTE FUNCTION "guard_user_created_incidents_tenant"();

-- VM127B : verification des relations multitenants.
-- Les lignes parentes sont verrouillees pendant les controles.
-- Les donnees historiques necessitent un audit distinct.


-- 1. EVENEMENTS
-- Un evenement doit appartenir a un incident ayant un tenant.
-- Son acteur, lorsqu'il existe, doit appartenir au meme tenant.

CREATE OR REPLACE FUNCTION
"check_timeline_event_tenant"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_incident_tenant TEXT;
    v_actor_tenant TEXT;
BEGIN
    SELECT i."tenantId"
    INTO v_incident_tenant
    FROM "Incident" i
    WHERE i."id" = NEW."incidentId"
    FOR SHARE;

    IF NOT FOUND OR v_incident_tenant IS NULL THEN
        RAISE EXCEPTION
            'Incident sans tenant pour evenement'
            USING ERRCODE = '23514';
    END IF;

    IF NEW."actorId" IS NOT NULL THEN
        SELECT u."tenantId"
        INTO v_actor_tenant
        FROM "User" u
        WHERE u."id" = NEW."actorId"
        FOR SHARE;

        IF NOT FOUND OR
           v_actor_tenant IS DISTINCT FROM v_incident_tenant THEN
            RAISE EXCEPTION
                'Acteur evenement et incident de tenants differents'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "TimelineEvent_tenant_guard"
BEFORE INSERT OR UPDATE OF
    "incidentId", "actorId"
ON "TimelineEvent"
FOR EACH ROW
EXECUTE FUNCTION "check_timeline_event_tenant"();


-- 2. MAIN COURANTE
-- L'auteur et l'eventuel utilisateur ayant modifie
-- une entree doivent appartenir au tenant de l'incident.

CREATE OR REPLACE FUNCTION
"check_log_entry_tenant"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_incident_tenant TEXT;
    v_author_tenant TEXT;
    v_editor_tenant TEXT;
BEGIN
    SELECT i."tenantId"
    INTO v_incident_tenant
    FROM "Incident" i
    WHERE i."id" = NEW."incidentId"
    FOR SHARE;

    IF NOT FOUND OR v_incident_tenant IS NULL THEN
        RAISE EXCEPTION
            'Incident sans tenant pour main courante'
            USING ERRCODE = '23514';
    END IF;

    SELECT u."tenantId"
    INTO v_author_tenant
    FROM "User" u
    WHERE u."id" = NEW."authorId"
    FOR SHARE;

    IF NOT FOUND OR
       v_author_tenant IS DISTINCT FROM v_incident_tenant THEN
        RAISE EXCEPTION
            'Auteur et incident de tenants differents'
            USING ERRCODE = '23514';
    END IF;

    IF NEW."editedById" IS NOT NULL THEN
        SELECT u."tenantId"
        INTO v_editor_tenant
        FROM "User" u
        WHERE u."id" = NEW."editedById"
        FOR SHARE;

        IF NOT FOUND OR
           v_editor_tenant IS DISTINCT FROM v_incident_tenant THEN
            RAISE EXCEPTION
                'Editeur et incident de tenants differents'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "LogEntry_tenant_guard"
BEFORE INSERT OR UPDATE OF
    "incidentId", "authorId", "editedById"
ON "LogEntry"
FOR EACH ROW
EXECUTE FUNCTION "check_log_entry_tenant"();


-- 3. INDICATEURS DE COMPROMISSION
-- Le createur doit appartenir au tenant de l'incident
-- auquel l'evenement est rattache.

CREATE OR REPLACE FUNCTION
"check_ioc_tenant"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_incident_id TEXT;
    v_incident_tenant TEXT;
    v_creator_tenant TEXT;
BEGIN
    -- Verrouiller d'abord l'evenement.
    -- En cas de deplacement concurrent, attendre la fin
    -- de la transaction et recuperer son incident actualise.
    SELECT e."incidentId"
    INTO v_incident_id
    FROM "TimelineEvent" e
    WHERE e."id" = NEW."timelineEventId"
      AND e."deletedAt" IS NULL
    FOR SHARE;

    IF NOT FOUND OR v_incident_id IS NULL THEN
        RAISE EXCEPTION
            'Evenement absent ou supprime pour IoC'
            USING ERRCODE = '23514';
    END IF;

    -- Seconde instruction SQL : nouveau snapshot READ COMMITTED.
    -- Ne pas fusionner avec la lecture de TimelineEvent.
    SELECT i."tenantId"
    INTO v_incident_tenant
    FROM "Incident" i
    WHERE i."id" = v_incident_id
      AND i."deletedAt" IS NULL
    FOR SHARE;

    IF NOT FOUND OR v_incident_tenant IS NULL THEN
        RAISE EXCEPTION
            'Incident sans tenant pour IoC'
            USING ERRCODE = '23514';
    END IF;

    -- Verifier et verrouiller le createur.
    SELECT u."tenantId"
    INTO v_creator_tenant
    FROM "User" u
    WHERE u."id" = NEW."createdById"
      AND u."deletedAt" IS NULL
      AND u."isActive" = TRUE
    FOR SHARE;

    IF NOT FOUND OR
       v_creator_tenant IS DISTINCT FROM v_incident_tenant THEN
        RAISE EXCEPTION
            'Createur IoC et incident de tenants differents'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "IoC_tenant_guard"
BEFORE INSERT OR UPDATE OF
    "timelineEventId", "createdById"
ON "IoC"
FOR EACH ROW
EXECUTE FUNCTION "check_ioc_tenant"();


-- OPENCRISIS_CONTACT_TENANT_V1

ALTER TABLE "Contact"
ADD COLUMN "tenantId" TEXT;

ALTER TABLE "Contact"
ADD CONSTRAINT "Contact_tenantId_fkey"
FOREIGN KEY ("tenantId")
REFERENCES "Tenant"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

CREATE INDEX "Contact_tenantId_deletedAt_idx"
ON "Contact"("tenantId", "deletedAt");

-- Rattachement historique uniquement quand il est determinable.
-- Les contacts sans entreprise identifiee restent conserves
-- avec tenantId NULL et ne sont pas exposes par l'API.
UPDATE "Contact" c
SET "tenantId" = u."tenantId"
FROM "User" u
WHERE c."createdById" = u."id"
  AND u."tenantId" IS NOT NULL;

CREATE OR REPLACE FUNCTION
"check_contact_tenant"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_creator_tenant TEXT;
BEGIN
    IF NEW."tenantId" IS NULL THEN
        RAISE EXCEPTION
            'Contact sans tenant refuse'
            USING ERRCODE = '23514';
    END IF;

    -- Verrouillage de l'utilisateur pour coordonner
    -- ses changements de tenant avec les Contacts.
    SELECT u."tenantId"
    INTO v_creator_tenant
    FROM "User" u
    WHERE u."id" = NEW."createdById"
    FOR SHARE;

    IF NOT FOUND OR
       v_creator_tenant IS DISTINCT FROM NEW."tenantId" THEN
        RAISE EXCEPTION
            'Contact et createur de tenants differents'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "Contact_tenant_guard"
BEFORE INSERT OR UPDATE OF "tenantId", "createdById"
ON "Contact"
FOR EACH ROW
EXECUTE FUNCTION "check_contact_tenant"();

CREATE OR REPLACE FUNCTION
"guard_user_contacts_tenant"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW."tenantId" IS NOT DISTINCT FROM OLD."tenantId" THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "Contact" c
        WHERE c."createdById" = NEW."id"
          AND c."tenantId" IS NOT NULL
          AND c."tenantId" IS DISTINCT FROM NEW."tenantId"
    ) THEN
        RAISE EXCEPTION
            'Changement tenant utilisateur incompatible avec Contacts'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "User_contacts_tenant_guard"
BEFORE UPDATE OF "tenantId"
ON "User"
FOR EACH ROW
EXECUTE FUNCTION "guard_user_contacts_tenant"();


-- OPENCRISIS_TAG_TENANT_V1

-- Les tags historiques sont preserves.
-- Les nouveaux tags seront propres a chaque entreprise.

ALTER TABLE "Tag"
ADD COLUMN "tenantId" TEXT;

ALTER TABLE "Tag"
ADD CONSTRAINT "Tag_tenantId_fkey"
FOREIGN KEY ("tenantId")
REFERENCES "Tenant"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

DROP INDEX "Tag_name_key";

CREATE UNIQUE INDEX "Tag_tenantId_name_key"
ON "Tag"("tenantId", "name");

CREATE INDEX "Tag_tenantId_idx"
ON "Tag"("tenantId");

-- Une copie par couple (tag historique, entreprise identifiable).
CREATE TEMP TABLE "tag_tenant_migration_map" (
    "originalTagId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "newTagId" TEXT NOT NULL,
    PRIMARY KEY ("originalTagId", "tenantId"),
    UNIQUE ("newTagId")
);

INSERT INTO "tag_tenant_migration_map"
    ("originalTagId", "tenantId", "newTagId")
SELECT DISTINCT
    lt."tagId",
    i."tenantId",
    gen_random_uuid()::TEXT
FROM "LogEntryTag" lt
JOIN "LogEntry" le
    ON le."id" = lt."logEntryId"
JOIN "Incident" i
    ON i."id" = le."incidentId"
WHERE i."tenantId" IS NOT NULL;

INSERT INTO "Tag"("id", "name", "color", "tenantId")
SELECT
    m."newTagId",
    t."name",
    t."color",
    m."tenantId"
FROM "tag_tenant_migration_map" m
JOIN "Tag" t
    ON t."id" = m."originalTagId";

UPDATE "LogEntryTag" lt
SET "tagId" = m."newTagId"
FROM "LogEntry" le
JOIN "Incident" i
    ON i."id" = le."incidentId"
JOIN "tag_tenant_migration_map" m
    ON m."tenantId" = i."tenantId"
WHERE lt."logEntryId" = le."id"
  AND lt."tagId" = m."originalTagId";

DROP TABLE "tag_tenant_migration_map";

-- Toute nouvelle association doit etre liee au meme tenant.
-- Lecture sequentielle des parents pour mieux gerer
-- les mises a jour concurrentes en READ COMMITTED.

CREATE OR REPLACE FUNCTION
"check_log_entry_tag_tenant"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_incident_id TEXT;
    v_entry_tenant TEXT;
    v_tag_tenant TEXT;
BEGIN
    SELECT le."incidentId"
    INTO v_incident_id
    FROM "LogEntry" le
    WHERE le."id" = NEW."logEntryId"
      AND le."deletedAt" IS NULL
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Entree de main courante absente pour tag'
            USING ERRCODE = '23514';
    END IF;

    SELECT i."tenantId"
    INTO v_entry_tenant
    FROM "Incident" i
    WHERE i."id" = v_incident_id
      AND i."deletedAt" IS NULL
    FOR SHARE;

    IF NOT FOUND OR v_entry_tenant IS NULL THEN
        RAISE EXCEPTION
            'Incident sans tenant pour association tag'
            USING ERRCODE = '23514';
    END IF;

    SELECT t."tenantId"
    INTO v_tag_tenant
    FROM "Tag" t
    WHERE t."id" = NEW."tagId"
    FOR SHARE;

    IF NOT FOUND OR
       v_tag_tenant IS DISTINCT FROM v_entry_tenant THEN
        RAISE EXCEPTION
            'Tag et main courante de tenants differents'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "LogEntryTag_tenant_guard"
BEFORE INSERT OR UPDATE OF "logEntryId", "tagId"
ON "LogEntryTag"
FOR EACH ROW
EXECUTE FUNCTION "check_log_entry_tag_tenant"();

-- Aucun nouveau tag global. Les anciens tags sans tenant
-- restent conserves pour regularisation historique.

CREATE OR REPLACE FUNCTION
"check_tag_tenant"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW."tenantId" IS NULL THEN
        RAISE EXCEPTION
            'Creation ou attribution de tag sans tenant interdite'
            USING ERRCODE = '23514';
    END IF;

    IF TG_OP = 'UPDATE'
       AND OLD."tenantId" IS NOT NULL
       AND OLD."tenantId" IS DISTINCT FROM NEW."tenantId" THEN
        RAISE EXCEPTION
            'Changement entreprise tag interdit'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "Tag_tenant_guard"
BEFORE INSERT OR UPDATE OF "tenantId"
ON "Tag"
FOR EACH ROW
EXECUTE FUNCTION "check_tag_tenant"();


-- OPENCRISIS_LOGENTRY_TAG_MOVE_GUARD_V1
--
-- Interdit le deplacement d'une entree de main courante
-- vers un incident d'un autre tenant si ses tags
-- appartiennent encore au tenant d'origine.
--
-- La mise a jour verrouille la ligne LogEntry.
-- Une association concurrente LogEntryTag utilise
-- FOR SHARE sur cette meme ligne dans son trigger.
--
-- Un deplacement au sein du meme tenant reste autorise.

CREATE OR REPLACE FUNCTION
"guard_log_entry_tags_incident"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_destination_tenant TEXT;
BEGIN
    IF NEW."incidentId" IS NOT DISTINCT FROM OLD."incidentId" THEN
        RETURN NEW;
    END IF;

    SELECT i."tenantId"
    INTO v_destination_tenant
    FROM "Incident" i
    WHERE i."id" = NEW."incidentId"
      AND i."deletedAt" IS NULL
    FOR SHARE;

    IF NOT FOUND OR v_destination_tenant IS NULL THEN
        RAISE EXCEPTION
            'Incident de destination invalide pour LogEntry'
            USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "LogEntryTag" lt
        LEFT JOIN "Tag" t
          ON t."id" = lt."tagId"
        WHERE lt."logEntryId" = NEW."id"
          AND (
              t."id" IS NULL
              OR t."tenantId"
                  IS DISTINCT FROM v_destination_tenant
          )
    ) THEN
        RAISE EXCEPTION
            'Deplacement LogEntry incompatible avec ses tags'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "LogEntry_tag_incident_guard"
BEFORE UPDATE OF "incidentId"
ON "LogEntry"
FOR EACH ROW
EXECUTE FUNCTION "guard_log_entry_tags_incident"();
