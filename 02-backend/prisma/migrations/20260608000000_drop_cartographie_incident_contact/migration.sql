-- Nettoyage des permissions CARTOGRAPHIE avant suppression de la valeur d'enum
DELETE FROM "RolePermission" WHERE "permissionId" IN (
  SELECT "id" FROM "Permission" WHERE "resource" = 'CARTOGRAPHIE'
);
DELETE FROM "Permission" WHERE "resource" = 'CARTOGRAPHIE';

-- AlterEnum
BEGIN;
CREATE TYPE "PermissionResource_new" AS ENUM ('DASHBOARD', 'MAIN_COURANTE_DIR', 'MAIN_COURANTE_OPS', 'TIMELINE', 'DOCUMENTS', 'BIBLIOTHEQUE', 'ANNUAIRE', 'ADMIN');
ALTER TABLE "Permission" ALTER COLUMN "resource" TYPE "PermissionResource_new" USING ("resource"::text::"PermissionResource_new");
ALTER TYPE "PermissionResource" RENAME TO "PermissionResource_old";
ALTER TYPE "PermissionResource_new" RENAME TO "PermissionResource";
DROP TYPE "PermissionResource_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "IncidentContact" DROP CONSTRAINT "IncidentContact_contactId_fkey";

-- DropForeignKey
ALTER TABLE "IncidentContact" DROP CONSTRAINT "IncidentContact_incidentId_fkey";

-- DropIndex
DROP INDEX "Contact_isGlobal_idx";

-- AlterTable
ALTER TABLE "Contact" DROP COLUMN "isGlobal";

-- DropTable
DROP TABLE "IncidentContact";
