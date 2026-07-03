/*
  Warnings:

  - Added the required column `organizationId` to the `refresh_tokens` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "audit_logs" ALTER COLUMN "organizationId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "organizationId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "refresh_tokens_organizationId_idx" ON "refresh_tokens"("organizationId");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
