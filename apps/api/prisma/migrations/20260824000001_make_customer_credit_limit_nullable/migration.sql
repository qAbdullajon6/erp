-- Migration: make Customer.creditLimit nullable
--
-- Semantics change:
--   NULL  = no configured credit ceiling ("No credit limit")
--   0     = explicitly $0 credit limit (no credit allowed)
--   > 0   = credit is capped at this amount
--
-- Before this migration, creditLimit defaulted to 0, making it impossible to
-- distinguish "no limit configured" from "explicitly zero credit". NULL is
-- the correct representation for the "no limit" state.
--
-- Data migration: convert all existing creditLimit = 0 to NULL, because
-- 0 was the auto-assigned default (never intentionally set by users). Any
-- customer with a positive creditLimit keeps its value unchanged.

UPDATE "customers" SET "creditLimit" = NULL WHERE "creditLimit" = 0;

-- Remove the NOT NULL constraint and the @default(0) for new rows.
-- New customers without an explicit creditLimit will receive NULL.
ALTER TABLE "customers" ALTER COLUMN "creditLimit" DROP NOT NULL;
ALTER TABLE "customers" ALTER COLUMN "creditLimit" DROP DEFAULT;
