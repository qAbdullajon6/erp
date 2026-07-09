import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const API_URL = 'http://localhost:4000';
const TEST_EMAIL = 'admin@flowerp.test';
const TEST_PASSWORD = 'FlowERP-Test-2026!';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TOKEN_DIR = resolve(__dirname, '../.playwright');
const TOKEN_FILE = resolve(TOKEN_DIR, 'auth-tokens.json');

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  timestamp: number;
}

/**
 * Acquire real authentication tokens from the test backend.
 * Tokens are cached for 30 minutes to avoid excessive API calls.
 */
export async function getTestAuthTokens(): Promise<AuthTokens> {
  // Create .playwright directory if it doesn't exist
  if (!existsSync(TOKEN_DIR)) {
    mkdirSync(TOKEN_DIR, { recursive: true });
  }

  // Check if cached tokens exist and are still fresh (less than 30 minutes old)
  if (existsSync(TOKEN_FILE)) {
    try {
      const cached = JSON.parse(readFileSync(TOKEN_FILE, 'utf-8')) as AuthTokens;
      const ageSeconds = (Date.now() - cached.timestamp) / 1000;
      if (ageSeconds < 30 * 60) {
        console.log(`[AUTH] Using cached tokens (${Math.round(ageSeconds)}s old)`);
        return cached;
      }
    } catch (error) {
      console.log('[AUTH] Cached tokens invalid, will fetch fresh tokens');
    }
  }

  // Fetch fresh tokens from backend
  console.log('[AUTH] Acquiring fresh tokens from backend...');
  const loginResponse = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });

  if (!loginResponse.ok) {
    throw new Error(`Login failed: ${loginResponse.status} ${loginResponse.statusText}`);
  }

  const loginData = await loginResponse.json();
  const accessToken = loginData.data?.accessToken;
  const refreshToken = loginData.data?.refreshToken;

  if (!accessToken) {
    throw new Error('No access token in login response');
  }

  const tokens: AuthTokens = {
    accessToken,
    refreshToken: refreshToken || '',
    timestamp: Date.now(),
  };

  // Save tokens to file (do NOT log the actual tokens)
  writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
  console.log(
    `[AUTH] Tokens acquired and cached. Access token length: ${accessToken.length}, Refresh token length: ${refreshToken?.length || 0}`
  );

  return tokens;
}

/**
 * Session manager key names - must match frontend auth.ts exactly
 */
export const SESSION_KEYS = {
  ACCESS_TOKEN: 'flowerp_access_token',
  REFRESH_TOKEN: 'flowerp_refresh_token',
} as const;
