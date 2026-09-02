-- ============================================================
-- Migration: add_driver_documents
-- Covers all schema additions that were previously applied via
-- `db push` without a migration file, making fresh deployments
-- reproducible from migration history alone.
--
-- Included changes:
--   1. New enums: DriverLicenseClass, DriverDocumentType,
--                 EmploymentType, WorkShift
--   2. New columns on "drivers" table
--   3. New table: driver_emergency_contacts
--   4. New table: driver_documents  (with all indexes)
-- ============================================================

-- 1. Enums -------------------------------------------------

CREATE TYPE "DriverLicenseClass" AS ENUM (
  'CLASS_A',
  'CLASS_B',
  'CLASS_C',
  'CLASS_D',
  'CLASS_E',
  'CE',
  'OTHER'
);

CREATE TYPE "DriverDocumentType" AS ENUM (
  'DRIVER_LICENSE',
  'PASSPORT_ID',
  'MEDICAL_CERTIFICATE',
  'ADR_CERTIFICATE',
  'BACKGROUND_CHECK',
  'OTHER'
);

CREATE TYPE "EmploymentType" AS ENUM (
  'FULL_TIME',
  'PART_TIME',
  'CONTRACTOR'
);

CREATE TYPE "WorkShift" AS ENUM (
  'DAY',
  'NIGHT',
  'FLEXIBLE'
);

-- 2. New columns on "drivers" ------------------------------

ALTER TABLE "drivers"
  ADD COLUMN IF NOT EXISTS "profilePhotoUrl"    TEXT,
  ADD COLUMN IF NOT EXISTS "licenseClass"       "DriverLicenseClass",
  ADD COLUMN IF NOT EXISTS "licenseIssueDate"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "licenseEndorsements" TEXT,
  ADD COLUMN IF NOT EXISTS "employmentType"     "EmploymentType",
  ADD COLUMN IF NOT EXISTS "hireDate"           TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "department"         TEXT,
  ADD COLUMN IF NOT EXISTS "baseLocation"       TEXT,
  ADD COLUMN IF NOT EXISTS "workShift"          "WorkShift",
  ADD COLUMN IF NOT EXISTS "preferredRegions"   TEXT,
  ADD COLUMN IF NOT EXISTS "availableDays"      JSONB,
  ADD COLUMN IF NOT EXISTS "driverNotes"        TEXT,
  ADD COLUMN IF NOT EXISTS "internalNotes"      TEXT;

-- 3. driver_emergency_contacts ----------------------------

CREATE TABLE IF NOT EXISTS "driver_emergency_contacts" (
  "id"             TEXT         NOT NULL,
  "driverId"       TEXT         NOT NULL,
  "organizationId" TEXT         NOT NULL,
  "name"           TEXT         NOT NULL,
  "relationship"   TEXT         NOT NULL,
  "phone"          TEXT         NOT NULL,
  "alternatePhone" TEXT,
  "email"          TEXT,
  "address"        TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "driver_emergency_contacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "driver_emergency_contacts_driverId_key"
  ON "driver_emergency_contacts"("driverId");

CREATE INDEX IF NOT EXISTS "driver_emergency_contacts_organizationId_idx"
  ON "driver_emergency_contacts"("organizationId");

ALTER TABLE "driver_emergency_contacts"
  ADD CONSTRAINT "driver_emergency_contacts_driverId_fkey"
    FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "driver_emergency_contacts_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. driver_documents -------------------------------------

CREATE TABLE IF NOT EXISTS "driver_documents" (
  "id"               TEXT         NOT NULL,
  "organizationId"   TEXT         NOT NULL,
  "driverId"         TEXT         NOT NULL,
  "type"             "DriverDocumentType" NOT NULL DEFAULT 'OTHER',
  "documentNumber"   TEXT,
  "issueDate"        TIMESTAMP(3),
  "expiryDate"       TIMESTAMP(3),
  "fileName"         TEXT,
  "storagePath"      TEXT,
  "mimeType"         TEXT,
  "fileSizeBytes"    INTEGER,
  "licenseClass"     "DriverLicenseClass",
  "endorsements"     TEXT,
  "uploadedByUserId" TEXT,
  "verifiedAt"       TIMESTAMP(3),
  "verifiedByUserId" TEXT,
  "rejectedAt"       TIMESTAMP(3),
  "rejectedByUserId" TEXT,
  "rejectionReason"  TEXT,
  "notes"            TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "driver_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "driver_documents_driverId_idx"
  ON "driver_documents"("driverId");

CREATE INDEX IF NOT EXISTS "driver_documents_organizationId_idx"
  ON "driver_documents"("organizationId");

CREATE INDEX IF NOT EXISTS "driver_documents_organizationId_driverId_idx"
  ON "driver_documents"("organizationId", "driverId");

CREATE INDEX IF NOT EXISTS "driver_documents_organizationId_expiryDate_idx"
  ON "driver_documents"("organizationId", "expiryDate");

ALTER TABLE "driver_documents"
  ADD CONSTRAINT "driver_documents_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "driver_documents_driverId_fkey"
    FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
