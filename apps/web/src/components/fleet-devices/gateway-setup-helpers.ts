import type { TelematicsProviderType } from '@/lib/api/telematics-devices';
import { siteConfig } from '@/lib/site-config';

/// Safe ingest URL helpers for the Gateway Setup Checklist.
/// Never invents localhost/internal hosts. Never persists secrets.

export const INGEST_PATH_PREFIX = '/telematics/ingest';

/// Canonical production public API origin (deploy Caddy `API_ADDRESS`, vercel.json,
/// mobile `EXPO_PUBLIC_API_URL`). Kept here so tests stay deterministic.
export const CANONICAL_PUBLIC_API_ORIGIN = 'https://api.flowerp.uz';

export type PublicApiOriginStatus = 'ok' | 'missing' | 'invalid' | 'internal';

export type PublicApiOriginResolution = {
  status: PublicApiOriginStatus;
  /// Absolute origin with scheme, no trailing slash — only when status === 'ok'.
  origin: string | null;
  /// Raw input that failed validation (for operator messaging / tests).
  rejectedValue?: string;
};

export type IngestUrlParts = {
  pathTemplate: string;
  /// Full customer-facing URL template, or null when public API origin is unavailable.
  urlTemplate: string | null;
  /// One-time absolute URL when plaintext secret is available in onboarding only.
  oneTimeUrl: string | null;
  hostLabel: string | null;
  /// True when no safe public origin could be resolved (do not show a fake URL).
  configurationMissing: boolean;
  originStatus: PublicApiOriginStatus;
};

function rawViteEnv(key: string): string | undefined {
  const value = (import.meta.env[key as keyof ImportMetaEnv] as string | undefined)?.trim();
  return value && value.length > 0 ? value : undefined;
}

/// Hosts that must never appear as customer-facing Traccar ingest URLs.
export function isBlockedPublicApiHostname(hostname: string): boolean {
  const h = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!h) return true;
  if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '::1') return true;
  if (h === 'host.docker.internal') return true;
  if (h.endsWith('.local') || h.endsWith('.localhost')) return true;
  /// Docker Compose service names used in this monorepo.
  if (
    h === 'api' ||
    h === 'web' ||
    h === 'postgres' ||
    h === 'traccar' ||
    h === 'redis' ||
    h === 'caddy'
  ) {
    return true;
  }
  /// RFC1918 / link-local — not Internet-reachable customer URLs.
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  return false;
}

export function normalizePublicApiOrigin(raw: string): PublicApiOriginResolution {
  const trimmed = raw.trim().replace(/\/$/, '');
  if (!trimmed) return { status: 'missing', origin: null };

  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { status: 'invalid', origin: null, rejectedValue: trimmed };
    }
    if (isBlockedPublicApiHostname(url.hostname)) {
      return { status: 'internal', origin: null, rejectedValue: trimmed };
    }
    return { status: 'ok', origin: url.origin };
  } catch {
    return { status: 'invalid', origin: null, rejectedValue: trimmed };
  }
}

/**
 * Resolve the public API origin for customer-facing gateway URLs.
 *
 * When `explicit` is provided (including empty string), only that value is used —
 * no silent fallback to production (lets tests and misconfigured deploys fail clearly).
 *
 * When `explicit` is omitted, precedence is:
 * 1. `VITE_TELEMATICS_INGEST_HOST` (optional telematics-specific public host)
 * 2. `VITE_API_PUBLIC_URL` (if set)
 * 3. `siteConfig.apiPublicUrl` (defaults to canonical `https://api.flowerp.uz`)
 */
export function resolvePublicApiOrigin(explicit?: string | null): PublicApiOriginResolution {
  if (explicit !== undefined) {
    if (explicit == null || explicit.trim() === '') {
      return { status: 'missing', origin: null };
    }
    return normalizePublicApiOrigin(explicit);
  }

  const telematicsHost = rawViteEnv('VITE_TELEMATICS_INGEST_HOST');
  if (telematicsHost) {
    return normalizePublicApiOrigin(telematicsHost);
  }

  const apiPublic = rawViteEnv('VITE_API_PUBLIC_URL');
  if (apiPublic) {
    return normalizePublicApiOrigin(apiPublic);
  }

  return normalizePublicApiOrigin(siteConfig.apiPublicUrl || CANONICAL_PUBLIC_API_ORIGIN);
}

export function buildIngestUrlHelper(args: {
  deviceId: string;
  /// Plaintext secret — only pass from the one-time create response.
  ingestSecret?: string | null;
  /**
   * Optional origin override. Pass `null` or `''` to simulate missing config.
   * Omit to use env / siteConfig defaults.
   */
  publicApiOrigin?: string | null;
}): IngestUrlParts {
  const pathTemplate = `${INGEST_PATH_PREFIX}/${args.deviceId}?secret=<connection-secret>`;
  const resolved =
    args.publicApiOrigin !== undefined
      ? resolvePublicApiOrigin(args.publicApiOrigin)
      : resolvePublicApiOrigin();

  if (resolved.status !== 'ok' || !resolved.origin) {
    return {
      pathTemplate,
      urlTemplate: null,
      oneTimeUrl: null,
      hostLabel: null,
      configurationMissing: true,
      originStatus: resolved.status,
    };
  }

  const urlTemplate = `${resolved.origin}${pathTemplate}`;
  let oneTimeUrl: string | null = null;
  if (args.ingestSecret) {
    oneTimeUrl = `${resolved.origin}${INGEST_PATH_PREFIX}/${args.deviceId}?secret=${encodeURIComponent(args.ingestSecret)}`;
  }

  return {
    pathTemplate,
    urlTemplate,
    oneTimeUrl,
    hostLabel: resolved.origin,
    configurationMissing: false,
    originStatus: 'ok',
  };
}

export function isTraccarProvider(provider: TelematicsProviderType): boolean {
  return provider === 'TRACCAR';
}

export function publicApiOriginStatusMessage(status: PublicApiOriginStatus): string {
  switch (status) {
    case 'ok':
      return '';
    case 'internal':
      return 'Public API URL is misconfigured (localhost or internal host). Set VITE_API_PUBLIC_URL to an Internet-reachable API origin such as https://api.flowerp.uz.';
    case 'invalid':
      return 'Public API URL is invalid. Set VITE_API_PUBLIC_URL to a full https origin (for example https://api.flowerp.uz).';
    case 'missing':
      return 'Public API URL is not configured. Set VITE_API_PUBLIC_URL so operators can copy a real FlowERP ingest URL.';
  }
}
