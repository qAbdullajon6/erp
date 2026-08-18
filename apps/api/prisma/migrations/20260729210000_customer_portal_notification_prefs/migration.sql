-- P3.3.5: customer portal notification preferences + locale settings.
ALTER TABLE "customer_portal_accounts"
  ADD COLUMN IF NOT EXISTS "notificationPreferences" JSONB,
  ADD COLUMN IF NOT EXISTS "language" TEXT DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS "timezone" TEXT DEFAULT 'UTC';
