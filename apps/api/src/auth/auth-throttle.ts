/// Environment-driven auth login/register throttle.
/// Production keeps the historical 5/min security default.
/// Development is deliberately relaxed so local QA and multi-role demos
/// are not blocked. Explicit AUTH_THROTTLE_* env vars always win.
export function resolveAuthThrottle(env: NodeJS.ProcessEnv = process.env): {
  default: { limit: number; ttl: number };
} {
  const isProd = (env.NODE_ENV ?? 'development') === 'production';
  const limitRaw = env.AUTH_THROTTLE_LIMIT;
  const ttlRaw = env.AUTH_THROTTLE_TTL_MS;

  const limitParsed = limitRaw !== undefined ? Number(limitRaw) : NaN;
  const ttlParsed = ttlRaw !== undefined ? Number(ttlRaw) : NaN;

  const limit =
    Number.isFinite(limitParsed) && limitParsed > 0
      ? Math.floor(limitParsed)
      : isProd
        ? 5
        : 200;

  const ttl =
    Number.isFinite(ttlParsed) && ttlParsed > 0
      ? Math.floor(ttlParsed)
      : 60_000;

  return { default: { limit, ttl } };
}

export const AUTH_THROTTLE = resolveAuthThrottle();
