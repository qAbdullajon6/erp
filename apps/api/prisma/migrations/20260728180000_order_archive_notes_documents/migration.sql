-- Order archive + internal notes + document metadata (P3.2)
ALTER TABLE "orders" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "orders_organizationId_archivedAt_idx" ON "orders"("organizationId", "archivedAt");

CREATE TYPE "OrderDocumentKind" AS ENUM ('POD', 'ATTACHMENT', 'OTHER');

CREATE TABLE "order_notes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_documents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" "OrderDocumentKind" NOT NULL DEFAULT 'ATTACHMENT',
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER,
    "storagePath" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_notes_organizationId_orderId_idx" ON "order_notes"("organizationId", "orderId");
CREATE INDEX "order_documents_organizationId_orderId_idx" ON "order_documents"("organizationId", "orderId");

ALTER TABLE "order_notes" ADD CONSTRAINT "order_notes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_notes" ADD CONSTRAINT "order_notes_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_notes" ADD CONSTRAINT "order_notes_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_documents" ADD CONSTRAINT "order_documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_documents" ADD CONSTRAINT "order_documents_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_documents" ADD CONSTRAINT "order_documents_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
