-- Migration: add_vehicle_extra_fields
-- Adds operational and technical detail columns to the vehicles table.
-- All columns are nullable so existing rows are unaffected.

ALTER TABLE "vehicles"
  ADD COLUMN IF NOT EXISTS "vin"          TEXT,
  ADD COLUMN IF NOT EXISTS "engineNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "odometer"     INTEGER,
  ADD COLUMN IF NOT EXISTS "fuelType"     TEXT,
  ADD COLUMN IF NOT EXISTS "transmission" TEXT,
  ADD COLUMN IF NOT EXISTS "axles"        INTEGER,
  ADD COLUMN IF NOT EXISTS "notes"        TEXT;
