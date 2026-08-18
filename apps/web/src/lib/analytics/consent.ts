/**
 * Cookie / tracking consent state, persisted and applied to the analytics
 * service (Google Consent Mode v2 + provider-specific gates).
 *
 * The analytics service boots with everything denied. Until the visitor makes
 * a choice, GA4/Meta/LinkedIn stay dark and GTM's Consent Mode holds tags. This
 * module records the decision, re-applies it on every load, and honours the
 * browser's Do Not Track signal as an implicit "reject".
 */

import { analytics } from './index';
import type { ConsentState } from './types';

const STORAGE_KEY = 'flowerp_consent';
const STORAGE_VERSION = 1;

interface StoredConsent {
  v: number;
  state: ConsentState;
  decidedAt: string;
}

export const CONSENT_ALL: ConsentState = {
  analytics: true,
  marketing: true,
  preferences: true,
  functionality: true,
};

export const CONSENT_ESSENTIAL: ConsentState = {
  analytics: false,
  marketing: false,
  preferences: false,
  functionality: true,
};

/// Whether the consent banner is currently occupying the bottom of the screen.
///
/// The banner is pinned to `bottom-0` at `z-[60]`, and on a phone it is tall
/// enough to cover anything else docked down there — including the landing
/// page's sticky "Get started" button, which is the primary mobile conversion
/// path. Rather than stack two bars on a 667px-tall screen, whatever else wants
/// that space subscribes here and stands down until the visitor has chosen.
let bannerOnScreen = false;
const bannerListeners = new Set<() => void>();

export function setConsentBannerOnScreen(value: boolean): void {
  if (bannerOnScreen === value) return;
  bannerOnScreen = value;
  bannerListeners.forEach((listener) => listener());
}

export function subscribeConsentBanner(listener: () => void): () => void {
  bannerListeners.add(listener);
  return () => bannerListeners.delete(listener);
}

export function getConsentBannerOnScreen(): boolean {
  return bannerOnScreen;
}

function doNotTrackEnabled(): boolean {
  if (typeof navigator === 'undefined') return false;
  const dnt =
    navigator.doNotTrack ||
    (window as unknown as { doNotTrack?: string }).doNotTrack ||
    (navigator as unknown as { msDoNotTrack?: string }).msDoNotTrack;
  return dnt === '1' || dnt === 'yes';
}

/** The stored decision, or null if the visitor hasn't chosen yet. */
export function loadConsent(): ConsentState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredConsent;
    if (parsed.v !== STORAGE_VERSION || !parsed.state) return null;
    return parsed.state;
  } catch {
    return null;
  }
}

export function saveConsent(state: ConsentState): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: StoredConsent = { v: STORAGE_VERSION, state, decidedAt: new Date().toISOString() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* best-effort */
  }
}

export function hasConsentDecision(): boolean {
  return loadConsent() !== null;
}

/** Persist a decision and push it into the analytics service. */
export function applyConsent(state: ConsentState, persist = true): void {
  if (persist) saveConsent(state);
  analytics.setConsent(state);
  analytics.track({
    name: 'cookie_consent_update',
    params: { analytics: state.analytics, marketing: state.marketing },
  });
}

/**
 * Re-apply the visitor's prior decision on load. If none exists, apply the
 * safe default (essential only). Returns whether a banner still needs showing.
 */
export function initConsent(): { needsDecision: boolean } {
  const stored = loadConsent();
  if (stored) {
    analytics.setConsent(stored);
    return { needsDecision: false };
  }
  if (doNotTrackEnabled()) {
    // Honour DNT as an explicit reject; no banner needed.
    applyConsent(CONSENT_ESSENTIAL);
    return { needsDecision: false };
  }
  analytics.setConsent(CONSENT_ESSENTIAL);
  return { needsDecision: true };
}
