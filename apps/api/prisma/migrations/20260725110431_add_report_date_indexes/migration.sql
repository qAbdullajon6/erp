-- CreateIndex
CREATE INDEX "expenses_organizationId_expenseDate_idx" ON "expenses"("organizationId", "expenseDate");

-- CreateIndex
CREATE INDEX "invoices_organizationId_issueDate_idx" ON "invoices"("organizationId", "issueDate");

-- CreateIndex
CREATE INDEX "orders_organizationId_deliveryDate_idx" ON "orders"("organizationId", "deliveryDate");
