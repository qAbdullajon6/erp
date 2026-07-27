/**
 * The API has no `/api` prefix of its own (apps/web's dev server proxies
 * `/api/*` -> the bare backend routes; see apps/web/src/lib/api/fetch.ts).
 * The mobile app has no such proxy, so it must be given the backend's own
 * origin directly — e.g. `http://192.168.1.20:4000` for a physical device
 * on the same LAN as the API (apps/api/.env.example: PORT=4000), or
 * `http://10.0.2.2:4000` for the Android emulator talking to the host
 * machine. Native `fetch` is not subject to CORS (that is a browser-only
 * mechanism), so no CORS_ORIGIN change is needed for native builds.
 */
const DEV_FALLBACK_API_URL = 'http://localhost:4000';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? DEV_FALLBACK_API_URL;

export const APP_VERSION = '1.0.0';

/** 15 minutes, mirrored from apps/api's JWT_ACCESS_EXPIRES_IN_SECONDS default. */
export const ACCESS_TOKEN_LIFETIME_SECONDS = 15 * 60;
