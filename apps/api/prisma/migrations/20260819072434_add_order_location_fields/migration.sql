-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "geocodedAt" TIMESTAMP(3),
ADD COLUMN     "lat" DECIMAL(10,7),
ADD COLUMN     "lng" DECIMAL(10,7),
ADD COLUMN     "postalCode" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "deliveryContactName" TEXT,
ADD COLUMN     "deliveryContactPhone" TEXT,
ADD COLUMN     "deliveryCountryCode" TEXT,
ADD COLUMN     "deliveryGeocodedAt" TIMESTAMP(3),
ADD COLUMN     "deliveryInstructions" TEXT,
ADD COLUMN     "deliveryLat" DECIMAL(10,7),
ADD COLUMN     "deliveryLng" DECIMAL(10,7),
ADD COLUMN     "deliveryPlaceName" TEXT,
ADD COLUMN     "deliveryPostalCode" TEXT,
ADD COLUMN     "deliveryWindowEnd" TIMESTAMP(3),
ADD COLUMN     "deliveryWindowStart" TIMESTAMP(3),
ADD COLUMN     "geocodeSource" TEXT,
ADD COLUMN     "pickupContactName" TEXT,
ADD COLUMN     "pickupContactPhone" TEXT,
ADD COLUMN     "pickupCountryCode" TEXT,
ADD COLUMN     "pickupGeocodedAt" TIMESTAMP(3),
ADD COLUMN     "pickupInstructions" TEXT,
ADD COLUMN     "pickupLat" DECIMAL(10,7),
ADD COLUMN     "pickupLng" DECIMAL(10,7),
ADD COLUMN     "pickupPlaceName" TEXT,
ADD COLUMN     "pickupPostalCode" TEXT,
ADD COLUMN     "pickupWindowEnd" TIMESTAMP(3),
ADD COLUMN     "pickupWindowStart" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "orders_organizationId_deliveryLat_deliveryLng_idx" ON "orders"("organizationId", "deliveryLat", "deliveryLng");
