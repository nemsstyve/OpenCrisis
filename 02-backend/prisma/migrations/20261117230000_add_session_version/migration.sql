-- VM129AC : version de session des utilisateurs
-- Migration additive, aucune session revoquee a cette etape.
ALTER TABLE "User"
ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
