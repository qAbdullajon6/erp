import type { APIRequestContext } from '@playwright/test';
import { API_URL } from './env';

export async function apiGet(
  request: APIRequestContext,
  path: string,
  accessToken: string,
): Promise<{ status: number; json: unknown }> {
  const response = await request.get(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await response.json().catch(() => null);
  return { status: response.status(), json };
}
