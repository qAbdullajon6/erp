import { PrismaClient } from '@prisma/client';
import { hash } from 'argon2';

const prisma = new PrismaClient();

async function seedDevelopmentCompany() {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '❌ Development seed cannot run in production. Set NODE_ENV=development.',
    );
  }

  console.log('🌱 Seeding development test company...');

  // Check if test org already exists
  const existing = await prisma.organization.findFirst({
    where: { name: 'Development Test Company' },
  });

  if (existing) {
    console.log('⏭️  Development test company already exists. Skipping seed.');
    return;
  }

  try {
    // Create organization
    const org = await prisma.organization.create({
      data: {
        name: 'Development Test Company',
        slug: 'dev-test-' + Date.now(),
        timezone: 'Asia/Tashkent',
        defaultCurrency: 'UZS',
      },
    });

    console.log(`✓ Created organization: ${org.name} (ID: ${org.id})`);

    // Create admin user
    const passwordHash = await hash('DevTest@123!');
    const adminUser = await prisma.user.create({
      data: {
        email: 'admin@dev-test.local',
        firstName: 'Dev',
        lastName: 'Admin',
        passwordHash,
      },
    });

    console.log(
      `✓ Created admin user: ${adminUser.email}`,
    );

    // Create admin membership
    const adminMembership = await prisma.membership.create({
      data: {
        organizationId: org.id,
        userId: adminUser.id,
        role: 'ADMIN',
      },
    });

    console.log(`✓ Created admin membership with ADMIN role`);

    // Create sample customers
    const customer1 = await prisma.customer.create({
      data: {
        organizationId: org.id,
        customerCode: 'CUST001',
        companyName: 'Silk Road Transport',
        contactName: 'Ahmed Khoja',
        phone: '+998901234567',
        email: 'contact@silkroad.uz',
        country: 'Uzbekistan',
        city: 'Tashkent',
        status: 'ACTIVE',
        paymentTerms: 'NET_30',
      },
    });

    const customer2 = await prisma.customer.create({
      data: {
        organizationId: org.id,
        customerCode: 'CUST002',
        companyName: 'Central Asia Logistics',
        contactName: 'Fatima Rahimova',
        phone: '+998903456789',
        email: 'info@calogistics.uz',
        country: 'Uzbekistan',
        city: 'Samarkand',
        status: 'ACTIVE',
        paymentTerms: 'DUE_ON_RECEIPT',
      },
    });

    console.log(`✓ Created 2 sample customers`);

    // Create sample drivers
    const driver1 = await prisma.driver.create({
      data: {
        organizationId: org.id,
        employeeCode: 'DRV001',
        firstName: 'Alisher',
        lastName: 'Karimov',
        phone: '+998907654321',
        licenseNumber: 'AB1234CD56',
        licenseExpiry: new Date('2027-12-31'),
        status: 'ACTIVE',
      },
    });

    const driver2 = await prisma.driver.create({
      data: {
        organizationId: org.id,
        employeeCode: 'DRV002',
        firstName: 'Nazira',
        lastName: 'Abdullayeva',
        phone: '+998908765432',
        licenseNumber: 'XY9876ZW12',
        licenseExpiry: new Date('2028-06-30'),
        status: 'ACTIVE',
      },
    });

    console.log(`✓ Created 2 sample drivers`);

    // Create sample vehicles
    const vehicle1 = await prisma.vehicle.create({
      data: {
        organizationId: org.id,
        vehicleCode: 'VEH001',
        plateNumber: 'T-001-DEV',
        type: 'Van',
        make: 'Toyota',
        model: 'Hiace',
        year: 2023,
        capacityKg: 1500,
        capacityM3: 8,
        status: 'AVAILABLE',
        insuranceExpiry: new Date('2027-03-15'),
        inspectionExpiry: new Date('2026-09-20'),
      },
    });

    const vehicle2 = await prisma.vehicle.create({
      data: {
        organizationId: org.id,
        vehicleCode: 'VEH002',
        plateNumber: 'I-002-DEV',
        type: 'Truck',
        make: 'Isuzu',
        model: 'NPR',
        year: 2022,
        capacityKg: 3000,
        capacityM3: 15,
        status: 'AVAILABLE',
        insuranceExpiry: new Date('2027-08-10'),
        inspectionExpiry: new Date('2026-11-05'),
      },
    });

    console.log(`✓ Created 2 sample vehicles`);

    // Create sample orders
    const order1 = await prisma.order.create({
      data: {
        organizationId: org.id,
        orderNumber: 'ORD-' + Date.now() + '-001',
        customerId: customer1.id,
        pickupAddress: '123 Industrial Avenue',
        pickupCity: 'Tashkent',
        pickupDate: new Date('2026-07-15T08:00:00Z'),
        deliveryAddress: '456 Commerce Street',
        deliveryCity: 'Samarkand',
        deliveryDate: new Date('2026-07-17T16:00:00Z'),
        cargoDescription: 'Electronics and textiles',
        price: '150000.00',
        currency: 'UZS',
        status: 'PENDING',
      },
    });

    const order2 = await prisma.order.create({
      data: {
        organizationId: org.id,
        orderNumber: 'ORD-' + Date.now() + '-002',
        customerId: customer2.id,
        pickupAddress: '789 Trade Park',
        pickupCity: 'Bukhara',
        pickupDate: new Date('2026-07-18T09:00:00Z'),
        deliveryAddress: '321 Market District',
        deliveryCity: 'Khiva',
        deliveryDate: new Date('2026-07-19T18:00:00Z'),
        cargoDescription: 'Agricultural products',
        price: '200000.00',
        currency: 'UZS',
        status: 'PENDING',
      },
    });

    console.log(`✓ Created 2 sample orders`);

    // Create onboarding progress for the org
    await prisma.onboardingProgress.create({
      data: {
        organizationId: org.id,
        completed: false,
        skipped: false,
        steps: {
          organizationProfile: false,
          firstCustomer: false,
          firstDriver: false,
          firstVehicle: false,
          firstOrder: false,
        },
      },
    });

    console.log(`✓ Created onboarding progress row`);

    console.log(
      '\n✅ Development company seeded successfully!\n',
    );
    console.log('📝 Test Credentials:');
    console.log('   Email: admin@dev-test.local');
    console.log('   Password: DevTest@123!');
    console.log(`   Organization: ${org.name}`);
    console.log('\n💡 This company is for local development only.\n');
  } catch (error) {
    console.error('❌ Seed failed:', error);
    throw error;
  }
}

// Run seed
seedDevelopmentCompany()
  .then(() => {
    console.log('🎉 Seed complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error during seed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
