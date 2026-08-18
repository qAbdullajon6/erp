-- AlterTable
ALTER TABLE "leads" ADD COLUMN "convertedOrganizationId" TEXT,
ADD COLUMN "convertedInvitationId" TEXT;

-- CreateTable
CREATE TABLE "lead_timeline_events" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "metadata" JSONB,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leads_convertedOrganizationId_key" ON "leads"("convertedOrganizationId");

-- CreateIndex
CREATE INDEX "lead_timeline_events_leadId_createdAt_idx" ON "lead_timeline_events"("leadId", "createdAt");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_convertedOrganizationId_fkey" FOREIGN KEY ("convertedOrganizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_timeline_events" ADD CONSTRAINT "lead_timeline_events_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
