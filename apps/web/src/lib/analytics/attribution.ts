/**
 * Marketing attribution capture (UTM + referrer + ad click IDs).
 *
 * On the visitor's first landing we snapshot where they came from and persist
 * it (first-touch attribution). Later — when they submit the demo form — we
 * attach that snapshot to the lead so sales knows which campaign, channel, or
 * referrer produced it.
 *
 * First-touch is deliberate: the query string is only present on the entry
 * page, and re-capturing on every navigation would overwrite a real campaign
 * source with an internal one. We keep the first non-empty snapshot for the
 * session and only refresh it when a *new* campaign query string appears.
 */

const STORAGE_KEY = 'flowerp_attribution';

export interface Attribution {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  /** Google Ads click id. */
  gclid?: string;
  /** Meta/Facebook click id. */
  fbclid?: string;
  /** document.referrer at first touch (external only). */
  referrer?: string;
  /** First path the visitor landed on. */
  landingPath?: string;
  /** ISO timestamp of first touch. */
  capturedAt?: string;
}

function readParams(search: string): Partial<Attribution> {
  const params = new URLSearchParams(search);
  const get = (k: string) => params.get(k)?.trim() || undefined;
  return {
    utmSource: get('utm_source'),
    utmMedium: get('utm_medium'),
    utmCampaign: get('utm_campaign'),
    utmTerm: get('utm_term'),
    utmContent: get('utm_content'),
    gclid: get('gclid'),
    fbclid: get('fbclid'),
  };
}

function hasCampaign(a: Partial<Attribution>): boolean {
  return Boolean(
    a.utmSource || a.utmMedium || a.utmCampaign || a.utmTerm || a.utmContent || a.gclid || a.fbclid,
  );
}

function load(): Attribution {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Attribution) : {};
  } catch {
    return {};
  }
}

function persist(a: Attribution): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
  } catch {
    /* storage may be unavailable (private mode, quota) — attribution is best-effort */
  }
}

/**
 * Capture attribution from the current URL. Call once on app mount. Only
 * overwrites a stored snapshot when the current URL carries campaign params,
 * so an internal navigation can never clobber the original source.
 */
export function captureAttribution(): Attribution {
  if (typeof window === 'undefined') return {};

  const existing = load();
  const current = readParams(window.location.search);

  // Nothing stored yet → snapshot whatever we have (even if empty, so
  // referrer/landingPath are recorded for direct/organic visits).
  const shouldWrite = !existing.capturedAt || hasCampaign(current);
  if (!shouldWrite) return existing;

  const referrer =
    typeof document !== 'undefined' && document.referrer && !document.referrer.startsWith(window.location.origin)
      ? document.referrer
      : existing.referrer;

  const next: Attribution = {
    ...existing,
    ...Object.fromEntries(Object.entries(current).filter(([, v]) => v !== undefined)),
    referrer,
    landingPath: existing.landingPath ?? window.location.pathname,
    capturedAt: existing.capturedAt ?? new Date().toISOString(),
  };

  persist(next);
  return next;
}

/** Read the stored first-touch attribution snapshot. */
export function getAttribution(): Attribution {
  return load();
}

/**
 * A short, human-readable source label for the lead record and analytics,
 * derived from attribution plus the CTA that opened the form.
 */
export function buildLeadSource(ctaSource?: string): string {
  const a = load();
  if (a.utmSource) {
    return [a.utmSource, a.utmMedium, a.utmCampaign].filter(Boolean).join(' / ');
  }
  if (ctaSource) return `landing_${ctaSource}`;
  return 'landing_demo_modal';
}
