-- Staff invitations: a person invited to join one organization with a role.
--
-- Additive only. Creates a new enum, a new "invitations" table, its foreign
-- keys (Cascade from the organization, SetNull from the inviting user), its
-- indexes, and a unique constraint on the token hash. No existing table,
-- column, or type is altered or dropped, so this applies cleanly on top of a
-- populated database with `prisma migrate deploy` and rewrites no data.

-- CreateEnum InvitationStatus
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

-- CreateTable invitations
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedByUserId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitations_tokenHash_key" ON "invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "invitations_organizationId_idx" ON "invitations"("organizationId");

-- CreateIndex
CREATE INDEX "invitations_organizationId_status_idx" ON "invitations"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Enforce "at most one open invitation per organization + email" at the
-- database level. An open invitation is one that is neither accepted nor
-- revoked; once it reaches either terminal state the row no longer blocks a
-- fresh invite. This is not expressible as a plain @@unique in Prisma's schema
-- DSL, since it is partial (WHERE ... IS NULL) and normalizes case with
-- lower(email). The service layer checks the same rule, but this index closes
-- the check-and-create race under concurrent requests (same technique as
-- "invoices_active_order_unique").
CREATE UNIQUE INDEX "invitations_open_org_email_unique" ON "invitations" ("organizationId", lower("email")) WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;
