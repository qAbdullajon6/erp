-- CreateTable onboarding_progress
CREATE TABLE "onboarding_progress" (
    "id" TEXT NOT NULL DEFAULT concat('', gen_random_uuid()),
    "organizationId" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "steps" JSONB NOT NULL DEFAULT '{"organizationProfile":false,"firstCustomer":false,"firstDriver":false,"firstVehicle":false,"firstOrder":false}',
    "skippedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_progress_organizationId_key" ON "onboarding_progress"("organizationId");

-- CreateIndex
CREATE INDEX "onboarding_progress_organizationId_idx" ON "onboarding_progress"("organizationId");

-- AddForeignKey
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
