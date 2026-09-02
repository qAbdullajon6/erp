-- Migration: add SupportTicketMessage for threaded ticket conversations
--
-- Adds a messages table to support ticket conversations.
-- Each row is a single message from either a tenant user (isStaff=false)
-- or a FlowERP platform admin (isStaff=true).
-- Existing SupportTicket rows are unaffected.

CREATE TABLE "support_ticket_messages" (
  "id"        TEXT         NOT NULL,
  "ticketId"  TEXT         NOT NULL,
  "authorId"  TEXT,
  "isStaff"   BOOLEAN      NOT NULL DEFAULT false,
  "body"      TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "support_ticket_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_ticket_messages_ticketId_createdAt_idx"
  ON "support_ticket_messages"("ticketId", "createdAt");

ALTER TABLE "support_ticket_messages"
  ADD CONSTRAINT "support_ticket_messages_ticketId_fkey"
  FOREIGN KEY ("ticketId")
  REFERENCES "support_tickets"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "support_ticket_messages"
  ADD CONSTRAINT "support_ticket_messages_authorId_fkey"
  FOREIGN KEY ("authorId")
  REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
