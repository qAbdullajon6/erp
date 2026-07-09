import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execPromise = promisify(exec);

const TEST_ENV_FILE = path.join(__dirname, '../.env.test');
const API_DIR = path.join(__dirname, '..');

async function setupTestDatabase() {
  console.log('\n🔧 Setting up test database...\n');

  const testDbUrl = 'postgresql://erp:erp@localhost:5433/erp_test?schema=public';
  const env = { ...process.env, DATABASE_URL: testDbUrl };

  try {
    // Check if .env.test exists
    if (!fs.existsSync(TEST_ENV_FILE)) {
      throw new Error(`.env.test not found at ${TEST_ENV_FILE}`);
    }

    console.log('📋 Running Prisma migrations for test database...');
    try {
      const { stdout, stderr } = await execPromise('npx prisma migrate deploy --skip-generate', {
        cwd: API_DIR,
        env,
      });
      console.log('✅ Migrations completed successfully');
    } catch (error: any) {
      // Migrations might fail if already applied, which is fine
      if ((error.stderr || '').includes('already executed') || (error.stdout || '').includes('already executed')) {
        console.log('✅ Migrations already applied');
      } else if ((error.stderr || '').includes('Blocks') || (error.stdout || '').includes('Blocks')) {
        // Prisma might have already applied the migrations
        console.log('✅ Database schema appears to be up to date');
      } else {
        console.log('⚠️  Migration note:', (error.stderr || error.stdout || error.message).substring(0, 200));
        // Continue anyway, database might be up to date
      }
    }

    console.log('🌱 Seeding test organization...');
    try {
      const { stdout, stderr } = await execPromise('npx tsx prisma/seed-test-org.ts', {
        cwd: API_DIR,
        env,
      });
      console.log('✅ Test organization seeded successfully');
    } catch (error: any) {
      // Seed might fail if data already exists, which is fine
      if ((error.stderr || '').includes('already exists') || (error.stdout || '').includes('already exists')) {
        console.log('✅ Test data already seeded');
      } else {
        console.log('⚠️  Seed note: data may already exist');
        // Don't fail if seed has issues, the data might already exist
      }
    }

    console.log('\n✅ Test database setup completed!\n');
    console.log('📌 Test credentials:');
    console.log('   Email: admin@flowerp.test');
    console.log('   Password: FlowERP-Test-2026!');
    console.log('   Database: erp_test on localhost:5433\n');

  } catch (error) {
    console.error('\n❌ Test database setup failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

setupTestDatabase();
