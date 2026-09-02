-- Migration: Support Phase 3 — unread state and notification integration
--
-- 1. Adds SUPPORT to the NotificationCategory enum so staff-reply notifications
--    can flow through the existing in-app notification pipeline.
-- 2. Adds support_ticket_user_reads for per-user ticket read state.

-- 1. Extend the enum (non-blocking ADD VALUE)
ALTER TYPE "NotificationCategory" ADD VALUE IF NOT EXISTS 'SUPPORT';

-- 2. Per-user support ticket read state
CREATE TABLE "support_ticket_user_reads" (
  "id"         TEXT         NOT NULL,
  "userId"     TEXT         NOT NULL,
  "ticketId"   TEXT         NOT NULL,
  "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "support_ticket_user_reads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "support_ticket_user_reads_userId_ticketId_key"
  ON "support_ticket_user_reads"("userId", "ticketId");

CREATE INDEX "support_ticket_user_reads_userId_idx"
  ON "support_ticket_user_reads"("userId");

ALTER TABLE "support_ticket_user_reads"
  ADD CONSTRAINT "support_ticket_user_reads_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "support_ticket_user_reads"
  ADD CONSTRAINT "support_ticket_user_reads_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
