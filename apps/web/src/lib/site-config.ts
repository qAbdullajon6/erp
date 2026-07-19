/**
 * Central, environment-driven site configuration for the marketing site.
 *
 * Every externally-visible constant the landing page depends on — the public
 * domain, contact channels, social profiles, and feature flags — lives here and
 * is sourced from `VITE_*` env variables with sensible production defaults.
 * Nothing that is meant to change per-deploy should be hardcoded in a component;
 * import from here instead.
 *
 * Vite inlines `import.meta.env.VITE_*` at build time, so these values are
 * baked into the client bundle. Never put secrets here — only public config.
 */

function env(key: string, fallback: string): string {
  const value = import.meta.env[key as keyof ImportMetaEnv] as string | undefined;
  return value && value.trim().length > 0 ? value.trim() : fallback;
}

function flag(key: string, fallback: boolean): boolean {
  const value = import.meta.env[key as keyof ImportMetaEnv] as string | undefined;
  if (value === undefined || value.trim() === '') return fallback;
  return value === 'true' || value === '1';
}

/** Digits-only phone, e.g. for `tel:` / `wa.me` links. */
function toDialable(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}

const marketingUrl = env('VITE_MARKETING_URL', 'https://flowerp.uz').replace(/\/$/, '');
const appUrl = env('VITE_APP_URL', 'https://app.flowerp.uz').replace(/\/$/, '');

const email = env('VITE_CONTACT_EMAIL', 'hello@itechnology.uz');
const phoneDisplay = env('VITE_CONTACT_PHONE', '+998 50 108 18 24');
const phoneDial = toDialable(env('VITE_CONTACT_PHONE_DIAL', phoneDisplay));
const whatsappNumber = toDialable(env('VITE_CONTACT_WHATSAPP', phoneDial)).replace(/^\+/, '');
const telegram = env('VITE_CONTACT_TELEGRAM', ''); // e.g. "flowerp" (without @)
const website = env('VITE_CONTACT_WEBSITE', 'https://itechnology.uz/');

export const siteConfig = {
  name: env('VITE_SITE_NAME', 'FlowERP'),
  legalName: env('VITE_SITE_LEGAL_NAME', 'FlowERP AI'),
  description:
    'The AI operating system for logistics. Unify orders, dispatch, fleet, and finance in one live command center.',

  /** Canonical public marketing origin (no trailing slash). */
  url: marketingUrl,
  /** Authenticated application origin (no trailing slash). */
  appUrl,

  /** Absolute URL to the Open Graph / social share image. */
  ogImage: `${marketingUrl}/og-image.png`,
  /** Absolute URL to the square logo used in structured data. */
  logo: `${marketingUrl}/logo-512.png`,

  contact: {
    email,
    emailHref: `mailto:${email}`,
    phoneDisplay,
    phoneHref: `tel:${phoneDial}`,
    whatsappDisplay: phoneDisplay,
    whatsappHref: whatsappNumber ? `https://wa.me/${whatsappNumber}` : '',
    telegramDisplay: telegram ? `@${telegram}` : '',
    telegramHref: telegram ? `https://t.me/${telegram}` : '',
    website,
    websiteDisplay: website.replace(/^https?:\/\//, '').replace(/\/$/, ''),
  },

  /** Public social profiles. Empty strings are filtered out by consumers. */
  social: {
    linkedin: env('VITE_SOCIAL_LINKEDIN', ''),
    twitter: env('VITE_SOCIAL_TWITTER', ''),
    facebook: env('VITE_SOCIAL_FACEBOOK', ''),
    instagram: env('VITE_SOCIAL_INSTAGRAM', ''),
  },

  /**
   * Feature flags — flip behaviour per-deploy without a code change. Anything
   * the landing page can toggle between "live" and "coming soon" belongs here.
   */
  features: {
    /** Whether the public self-serve sign-up flow is live. */
    signup: flag('VITE_FEATURE_SIGNUP', false),
    /** Whether a standalone /pricing page exists (vs. anchor-only). */
    pricingPage: flag('VITE_FEATURE_PRICING_PAGE', false),
    /** Show the cookie-consent banner (EU/GDPR posture). */
    cookieConsent: flag('VITE_FEATURE_COOKIE_CONSENT', true),
  },
} as const;

/** Ordered, non-empty social profile URLs — handy for schema `sameAs`. */
export function socialProfiles(): string[] {
  return Object.values(siteConfig.social).filter((u) => u.length > 0);
}

export type SiteConfig = typeof siteConfig;
