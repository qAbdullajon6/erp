-- AddColumn: per-customer ISO 4217 currency override
-- When NULL the organization defaultCurrency is used.
ALTER TABLE "customers" ADD COLUMN "currency" VARCHAR(3);

-- MakeOptional: contact_name may now be NULL (set after creation)
ALTER TABLE "customers" ALTER COLUMN "contactName" DROP NOT NULL;
