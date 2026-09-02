-- AlterTable
ALTER TABLE "geofences" ADD COLUMN     "autoCreated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "linkedDispatchId" TEXT;

-- AlterTable
ALTER TABLE "telematics_settings" ADD COLUMN     "arrivalGeofenceEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "arrivalGeofenceRadiusM" INTEGER NOT NULL DEFAULT 150;
