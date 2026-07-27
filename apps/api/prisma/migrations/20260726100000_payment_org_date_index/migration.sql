-- CreateIndex
CREATE INDEX "payments_organizationId_paymentDate_idx" ON "payments"("organizationId", "paymentDate");
