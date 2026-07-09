import { chromium } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3002';
const API_URL = process.env.API_URL || 'http://localhost:4000';
const TEST_EMAIL = 'admin@flowerp.test';
const TEST_PASSWORD = 'FlowERP-Test-2026!';

async function globalSetup() {
  console.log('\n🔐 Setting up authenticated session...');

  // Check if auth state already exists and is recent (less than 1 hour old)
  const authStatePath = path.join(__dirname, 'auth-state.json');
  if (fs.existsSync(authStatePath)) {
    const stats = fs.statSync(authStatePath);
    const ageMinutes = (Date.now() - stats.mtime.getTime()) / (1000 * 60);
    if (ageMinutes < 60) {
      const content = fs.readFileSync(authStatePath, 'utf-8');
      const data = JSON.parse(content);
      if (data.cookies && data.cookies.length > 0) {
        console.log('✅ Using existing auth state (less than 1 hour old)');
        return;
      }
    }
    console.log('🔄 Auth state expired or invalid, refreshing...');
  }

  // Wait for rate limiter to reset (backend rate limits auth to 5 per 60 seconds in production)
  // In test mode, rate limiting is disabled, but we wait anyway for consistency
  console.log('⏳ Waiting 70 seconds to ensure rate limiter reset...');
  await new Promise((r) => setTimeout(r, 70000));

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Call API directly to get tokens
    console.log('🔑 Authenticating via API...');
    const loginResponse = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });

    if (!loginResponse.ok) {
      throw new Error(`API login failed: ${loginResponse.status} ${loginResponse.statusText}`);
    }

    const loginData = await loginResponse.json();
    const accessToken = loginData.data?.accessToken;
    const refreshToken = loginData.data?.refreshToken;

    if (!accessToken) {
      throw new Error('No access token in login response');
    }

    console.log('✅ API authentication successful');

    // Navigate to app to set cookies
    console.log('📍 Navigating to app...');
    await page.goto(`${FRONTEND_URL}/app`, { waitUntil: 'domcontentloaded' });

    // Save tokens as cookies (so Playwright can restore them via storageState)
    await context.addCookies([
      {
        name: 'flowerp_access_token',
        value: accessToken,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
        expires: (Date.now() / 1000) + (900 * 60), // 900 minutes from now
      },
      {
        name: 'flowerp_refresh_token',
        value: refreshToken || '',
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
        expires: (Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days from now
      },
    ]);

    // Also set in sessionStorage for redundancy
    await page.evaluate((token: string) => {
      sessionStorage.setItem('flowerp_access_token', token);
    }, accessToken);

    if (refreshToken) {
      await page.evaluate((token: string) => {
        sessionStorage.setItem('flowerp_refresh_token', token);
      }, refreshToken);
    }

    console.log('✅ Tokens injected (cookies + sessionStorage)');

    // Reload to apply tokens
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Navigate to customers to verify auth
    await page.goto(`${FRONTEND_URL}/app/customers`, { waitUntil: 'domcontentloaded' });
    const finalUrl = page.url();

    if (!finalUrl.includes('/app/customers') && !finalUrl.includes('/app')) {
      throw new Error(`Expected to be at /app, but URL is ${finalUrl}`);
    }

    console.log('✅ Successfully authenticated');

    // Save authenticated state (cookies will be saved)
    console.log('💾 Saving authentication state...');
    await context.storageState({
      path: authStatePath,
    });

    console.log(`✅ Auth state saved`);
  } catch (error) {
    console.error('❌ Authentication failed:', error instanceof Error ? error.message : error);
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;
