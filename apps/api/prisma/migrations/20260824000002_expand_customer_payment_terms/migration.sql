-- Migration: expand CustomerPaymentTerms enum and add paymentTermsDays
--
-- Adds NET_7, NET_60, NET_90, and CUSTOM to the CustomerPaymentTerms enum.
-- Adds paymentTermsDays (nullable integer) to Customer for CUSTOM terms.
--
-- PostgreSQL ADD VALUE is non-blocking (no table rewrite, no lock escalation).
-- Enum values can only be added, never removed.
-- All existing customers keep their current paymentTerms unchanged.

-- 1. Extend the enum — order matters for display but not behaviour.
--    ADD VALUE ... BEFORE / AFTER maintains a logical ordering.
ALTER TYPE "CustomerPaymentTerms" ADD VALUE IF NOT EXISTS 'NET_7'  BEFORE 'NET_15';
ALTER TYPE "CustomerPaymentTerms" ADD VALUE IF NOT EXISTS 'NET_60' AFTER  'NET_45';
ALTER TYPE "CustomerPaymentTerms" ADD VALUE IF NOT EXISTS 'NET_90' AFTER  'NET_60';
ALTER TYPE "CustomerPaymentTerms" ADD VALUE IF NOT EXISTS 'CUSTOM' AFTER  'NET_90';

-- 2. Add the custom days field.
--    NULL for all existing rows is correct — no existing customer uses CUSTOM.
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "paymentTermsDays" INTEGER;
