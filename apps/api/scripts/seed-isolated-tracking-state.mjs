/// Gives the isolated UI-audit database one vehicle that shows up on the fleet
/// map, so browser tests can exercise selection and deep-link behaviour. The
/// seeded org has vehicles but no telematics state, and /tracking/live is
/// driven entirely by VehicleTelematicsState rows.
///
/// Refuses to run against anything but a disposable erp_e2e_* database.
import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL ?? "";
const dbName = url.split("/").pop()?.split("?")[0] ?? "";
if (!/^erp_e2e_/.test(dbName)) {
  console.error(`Refusing to seed "${dbName}" — expected a disposable erp_e2e_* database.`);
  process.exit(1);
}

const prisma = new PrismaClient();

const vehicle = await prisma.vehicle.findFirst({
  where: { archivedAt: null },
  select: { id: true, organizationId: true, plateNumber: true },
});

if (!vehicle) {
  console.error("No non-archived vehicle to attach tracking state to.");
  process.exit(1);
}

const now = new Date();
await prisma.vehicleTelematicsState.upsert({
  where: { vehicleId: vehicle.id },
  create: {
    organizationId: vehicle.organizationId,
    vehicleId: vehicle.id,
    latitude: 41.2995,
    longitude: 69.2401,
    speedKph: 0,
    heading: 90,
    ignitionOn: true,
    movementState: "STOPPED",
    lastRecordedAt: now,
    lastReceivedAt: now,
  },
  update: { lastRecordedAt: now, lastReceivedAt: now },
});

console.log(`seeded tracking state for ${vehicle.plateNumber} (${vehicle.id}) in ${dbName}`);
await prisma.$disconnect();
