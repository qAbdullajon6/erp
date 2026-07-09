#!/usr/bin/env node

import { spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const API_DIR = join(__dirname, 'apps/api');
const WEB_DIR = join(__dirname, 'apps/web');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForService(url, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, { timeout: 5000 }, (res) => {
          resolve();
        });
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Timeout'));
        });
      });
      return true;
    } catch {
      process.stdout.write('.');
      await sleep(1000);
    }
  }
  return false;
}

async function setupTestDatabase() {
  log('\n🔧 Setting up test database...\n', 'yellow');

  const envFile = join(API_DIR, '.env.test');
  if (!existsSync(envFile)) {
    throw new Error(`.env.test not found at ${envFile}`);
  }

  // Run migrations
  log('📋 Running Prisma migrations for test database...', 'yellow');
  const migrateResult = spawnSync('npx', ['prisma', 'migrate', 'deploy', '--skip-generate'], {
    cwd: API_DIR,
    env: {
      ...process.env,
      DATABASE_URL: 'postgresql://erp:erp@localhost:5433/erp_test?schema=public',
    },
    encoding: 'utf-8',
  });

  if (migrateResult.status === 0 || (migrateResult.stderr && migrateResult.stderr.includes('already executed'))) {
    log('✅ Migrations completed', 'green');
  } else {
    log('⚠️  Migrations warning: ' + (migrateResult.stderr || 'unknown'), 'yellow');
  }

  // Run seed
  log('🌱 Seeding test organization...', 'yellow');
  const seedResult = spawnSync('npx', ['tsx', 'prisma/seed-test-org.ts'], {
    cwd: API_DIR,
    env: {
      ...process.env,
      DATABASE_URL: 'postgresql://erp:erp@localhost:5433/erp_test?schema=public',
    },
    encoding: 'utf-8',
  });

  if (seedResult.status === 0) {
    log('✅ Test organization seeded', 'green');
  } else if (seedResult.stderr && seedResult.stderr.includes('already exists')) {
    log('✅ Test data already seeded', 'green');
  } else {
    log('⚠️  Seed warning: ' + (seedResult.stderr || 'unknown'), 'yellow');
  }

  log('\n✅ Test database setup completed!', 'green');
  log('\n📌 Test credentials:', 'blue');
  log('   Email: admin@flowerp.test', 'blue');
  log('   Password: FlowERP-Test-2026!', 'blue');
  log('   Database: erp_test on localhost:5433\n', 'blue');
}

async function startService(name, command, args, cwd, env = {}) {
  log(`🚀 Starting ${name}...`, 'yellow');

  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: 'inherit',
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to start ${name}: ${err.message}`));
    });

    proc.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`${name} exited with code ${code}`));
      }
    });

    // Give the service time to start
    setTimeout(() => {
      resolve(proc);
    }, 2000);
  });
}

async function runPlaywrightTests(runNumber) {
  log(`\n${'═'.repeat(60)}`, 'blue');
  log(`  E2E Test Run #${runNumber}`, 'blue');
  log(`${'═'.repeat(60)}\n`, 'blue');

  const result = spawnSync('npx', ['playwright', 'test', '--project=authenticated'], {
    cwd: WEB_DIR,
    stdio: 'inherit',
  });

  return result.status === 0;
}

async function runValidation() {
  log(`\n${'═'.repeat(60)}`, 'blue');
  log(`  Validation: typecheck, lint, and build`, 'blue');
  log(`${'═'.repeat(60)}\n`, 'blue');

  const validations = [
    { name: 'Typecheck', cmd: 'npm', args: ['run', 'typecheck'] },
    { name: 'Lint', cmd: 'npm', args: ['run', 'lint'] },
    { name: 'Build', cmd: 'npm', args: ['run', 'build'] },
  ];

  const results = {};

  for (const validation of validations) {
    log(`\n📝 ${validation.name}...`, 'yellow');
    const result = spawnSync(validation.cmd, validation.args, {
      cwd: WEB_DIR,
      stdio: 'inherit',
    });
    results[validation.name] = result.status === 0;
  }

  return results;
}

async function main() {
  const processes = [];
  let run1Passed = false;
  let run2Passed = false;
  let validationResults = {};

  try {
    log(`\n${'═'.repeat(60)}`, 'blue');
    log(`  E2E Test Suite: Customers CRUD - Complete Setup`, 'blue');
    log(`${'═'.repeat(60)}\n`, 'blue');

    // Setup test database
    await setupTestDatabase();

    // Start backend in test mode
    log('🚀 Step 2: Starting API server in test mode...\n', 'yellow');
    const apiEnv = {
      NODE_ENV: 'test',
      DISABLE_AUTH_THROTTLE: 'true',
      DATABASE_URL: 'postgresql://erp:erp@localhost:5433/erp_test?schema=public',
    };

    const apiProcess = spawn('npm', ['run', 'start:dev'], {
      cwd: API_DIR,
      env: { ...process.env, ...apiEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    processes.push(apiProcess);

    log(`✅ API server started (PID: ${apiProcess.pid})`, 'green');

    // Wait for API to be ready
    log('⏳ Waiting for API to be ready...', 'yellow');
    if (!(await waitForService('http://localhost:4000/health'))) {
      throw new Error('API failed to start');
    }
    log('\n✅ API is ready', 'green');

    // Start frontend dev server
    log('\n🎨 Step 3: Starting frontend dev server...\n', 'yellow');
    const webProcess = spawn('npm', ['run', 'dev'], {
      cwd: WEB_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    processes.push(webProcess);

    log(`✅ Frontend dev server started (PID: ${webProcess.pid})`, 'green');

    // Wait for frontend to be ready
    log('⏳ Waiting for frontend to be ready...', 'yellow');
    if (!(await waitForService('http://localhost:3001'))) {
      throw new Error('Frontend failed to start');
    }
    log('\n✅ Frontend is ready', 'green');

    // Give services a moment to stabilize
    await sleep(2000);

    // Run E2E tests (Run 1)
    run1Passed = await runPlaywrightTests(1);

    // Wait between runs
    log('\n⏳ Waiting 5 seconds before second test run...', 'yellow');
    await sleep(5000);

    // Run E2E tests (Run 2)
    run2Passed = await runPlaywrightTests(2);

    // Run validation
    validationResults = await runValidation();

    // Final report
    log(`\n${'═'.repeat(60)}`, 'blue');
    log(`  Final Report`, 'blue');
    log(`${'═'.repeat(60)}\n`, 'blue');

    const statusColor = run1Passed ? 'green' : 'red';
    log(`${run1Passed ? '✅' : '❌'} E2E Test Run #1: ${run1Passed ? 'PASSED' : 'FAILED'}`, statusColor);

    const status2Color = run2Passed ? 'green' : 'red';
    log(`${run2Passed ? '✅' : '❌'} E2E Test Run #2: ${run2Passed ? 'PASSED' : 'FAILED'}`, status2Color);

    for (const [name, passed] of Object.entries(validationResults)) {
      const color = passed ? 'green' : 'red';
      log(`${passed ? '✅' : '❌'} ${name}: ${passed ? 'PASSED' : 'FAILED'}`, color);
    }

    log(`\n${'═'.repeat(60)}\n`, 'blue');

    const allPassed =
      run1Passed &&
      run2Passed &&
      Object.values(validationResults).every((v) => v);

    if (allPassed) {
      log('✅ ALL TESTS AND VALIDATIONS PASSED', 'green');
      log(`${'═'.repeat(60)}\n`, 'blue');
      process.exit(0);
    } else {
      log('❌ SOME TESTS OR VALIDATIONS FAILED', 'red');
      log(`${'═'.repeat(60)}\n`, 'blue');
      process.exit(1);
    }
  } catch (error) {
    log(`\n❌ Error: ${error instanceof Error ? error.message : error}`, 'red');
    process.exit(1);
  } finally {
    // Cleanup
    log('\n🧹 Cleaning up processes...', 'yellow');
    for (const proc of processes) {
      if (proc && !proc.killed) {
        proc.kill();
      }
    }
  }
}

main();
