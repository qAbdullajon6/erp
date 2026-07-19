-- Add first-touch marketing attribution to leads. All columns are nullable and
-- additive, so existing rows keep working without a backfill.
ALTER TABLE "leads" ADD COLUMN "utmSource" TEXT;
ALTER TABLE "leads" ADD COLUMN "utmMedium" TEXT;
ALTER TABLE "leads" ADD COLUMN "utmCampaign" TEXT;
ALTER TABLE "leads" ADD COLUMN "utmTerm" TEXT;
ALTER TABLE "leads" ADD COLUMN "utmContent" TEXT;
ALTER TABLE "leads" ADD COLUMN "referrer" TEXT;
ALTER TABLE "leads" ADD COLUMN "landingPath" TEXT;
