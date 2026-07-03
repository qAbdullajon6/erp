// Prisma seed entry point — structure only for this phase.
//
// Intentionally does NOT create any logistics demo data (organizations,
// users, orders, customers, ...). The frontend's own demo data continues to
// live in apps/web/src/lib/mock-data.ts and localStorage, untouched. Real
// seed data will be added once the ERP modules and auth flow exist.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seed scaffold: no demo data is created in this phase.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
