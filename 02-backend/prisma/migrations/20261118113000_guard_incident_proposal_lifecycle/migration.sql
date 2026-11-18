-- OpenCrisis / DETERIS R2D
-- Protection du cycle de vie IncidentProposal.
--
-- PENDING -> APPROVED -> CONVERTED
-- PENDING -> REJECTED
--
-- Aucun retour en arriere.
-- Source et identite de l'alerte immuables.

CREATE FUNCTION incident_proposal_lifecycle_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $guard$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW."status" <> 'PENDING' THEN
            RAISE EXCEPTION
                'IncidentProposal : creation hors PENDING'
                USING ERRCODE = '23514';
        END IF;
    ELSE
        -- L'identite d'une alerte est definitive.
        IF NEW."id" IS DISTINCT FROM OLD."id"
           OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
           OR NEW."sourceType" IS DISTINCT FROM OLD."sourceType"
           OR NEW."sourceId" IS DISTINCT FROM OLD."sourceId"
           OR NEW."externalEventId"
              IS DISTINCT FROM OLD."externalEventId"
           OR NEW."receivedAt" IS DISTINCT FROM OLD."receivedAt"
           OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
        THEN
            RAISE EXCEPTION
                'IncidentProposal : identite immuable'
                USING ERRCODE = '23514';
        END IF;

        -- Les decisions finales ne sont plus modifiables.
        IF OLD."status" IN ('REJECTED', 'CONVERTED') THEN
            RAISE EXCEPTION
                'IncidentProposal : decision definitive'
                USING ERRCODE = '23514';
        END IF;

        IF NEW."status" IS DISTINCT FROM OLD."status" THEN
            IF NOT (
                (
                    OLD."status" = 'PENDING'
                    AND NEW."status" IN ('APPROVED', 'REJECTED')
                )
                OR (
                    OLD."status" = 'APPROVED'
                    AND NEW."status" = 'CONVERTED'
                )
            ) THEN
                RAISE EXCEPTION
                    'IncidentProposal : transition interdite'
                    USING ERRCODE = '23514';
            END IF;
        END IF;

        -- Une proposition approuvee ne peut pas
        -- changer de validateur lors de la conversion.
        IF OLD."status" = 'APPROVED'
           AND (
               NEW."reviewedById"
                   IS DISTINCT FROM OLD."reviewedById"
               OR NEW."reviewedAt"
                   IS DISTINCT FROM OLD."reviewedAt"
           )
        THEN
            RAISE EXCEPTION
                'IncidentProposal : validation immuable'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    -- Cohérence des données selon le statut.
    IF NEW."status" = 'PENDING' THEN
        IF NEW."reviewedById" IS NOT NULL
           OR NEW."reviewedAt" IS NOT NULL
           OR NEW."incidentId" IS NOT NULL
        THEN
            RAISE EXCEPTION
                'IncidentProposal : attente incoherente'
                USING ERRCODE = '23514';
        END IF;

    ELSIF NEW."status" IN ('APPROVED', 'REJECTED') THEN
        IF NEW."reviewedById" IS NULL
           OR NEW."reviewedAt" IS NULL
           OR NEW."incidentId" IS NOT NULL
        THEN
            RAISE EXCEPTION
                'IncidentProposal : decision incoherente'
                USING ERRCODE = '23514';
        END IF;

    ELSIF NEW."status" = 'CONVERTED' THEN
        IF NEW."reviewedById" IS NULL
           OR NEW."reviewedAt" IS NULL
           OR NEW."incidentId" IS NULL
        THEN
            RAISE EXCEPTION
                'IncidentProposal : conversion incoherente'
                USING ERRCODE = '23514';
        END IF;

    ELSE
        RAISE EXCEPTION
            'IncidentProposal : statut invalide'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$guard$;

CREATE TRIGGER "IncidentProposal_lifecycle_guard"
BEFORE INSERT OR UPDATE
ON "IncidentProposal"
FOR EACH ROW
EXECUTE FUNCTION incident_proposal_lifecycle_guard();
