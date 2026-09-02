import { resolveAuthThrottle } from './auth-throttle';

describe('resolveAuthThrottle', () => {
  it('uses production defaults (5 / 60s) when NODE_ENV=production', () => {
    expect(resolveAuthThrottle({ NODE_ENV: 'production' })).toEqual({
      default: { limit: 5, ttl: 60_000 },
    });
  });

  it('uses relaxed development defaults', () => {
    expect(resolveAuthThrottle({ NODE_ENV: 'development' })).toEqual({
      default: { limit: 200, ttl: 60_000 },
    });
  });

  it('honors explicit AUTH_THROTTLE_* overrides in any environment', () => {
    expect(
      resolveAuthThrottle({
        NODE_ENV: 'production',
        AUTH_THROTTLE_LIMIT: '30',
        AUTH_THROTTLE_TTL_MS: '120000',
      }),
    ).toEqual({
      default: { limit: 30, ttl: 120_000 },
    });
  });
});
