-- CreateEnum
CREATE TYPE "CustomerPortalInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

-- CreateTable
CREATE TABLE "customer_portal_invitations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "CustomerPortalInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedByUserId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_portal_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_portal_invitations_tokenHash_key" ON "customer_portal_invitations"("tokenHash");

-- CreateIndex: at most one OPEN (unaccepted, unrevoked) invitation per customer,
-- same partial-unique pattern as invitations_open_org_email_unique.
CREATE UNIQUE INDEX "customer_portal_invitations_open_customer_unique" ON "customer_portal_invitations"("customerId") WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;

-- CreateIndex
CREATE INDEX "customer_portal_invitations_organizationId_idx" ON "customer_portal_invitations"("organizationId");

-- CreateIndex
CREATE INDEX "customer_portal_invitations_organizationId_status_idx" ON "customer_portal_invitations"("organizationId", "status");

-- CreateIndex
CREATE INDEX "customer_portal_invitations_customerId_idx" ON "customer_portal_invitations"("customerId");

-- AddForeignKey
ALTER TABLE "customer_portal_invitations" ADD CONSTRAINT "customer_portal_invitations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_portal_invitations" ADD CONSTRAINT "customer_portal_invitations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_portal_invitations" ADD CONSTRAINT "customer_portal_invitations_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
