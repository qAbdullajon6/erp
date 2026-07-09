-- The 20260708_add_onboarding_progress migration gave `id` and `updatedAt`
-- database-level defaults that schema.prisma never declared. Prisma Client
-- supplies both itself (@default(uuid()) and @updatedAt), so the defaults were
-- dead weight — but they made the datamodel and the database disagree, which
-- meant `prisma migrate dev` demanded a full database reset on every new
-- migration and any drift check in CI would fail.
--
-- Dropping a column DEFAULT does not touch existing rows and does not drop
-- data. Every write to this table goes through Prisma Client (the only raw SQL
-- in the API is `SELECT 1` in the health check), so nothing relies on the
-- database filling these columns in.

-- AlterTable
ALTER TABLE "onboarding_progress" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;
