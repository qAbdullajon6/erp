import { useEffect, useState } from 'react';

/// Whether React has taken over the server-rendered markup on this page.
///
/// Between first paint and hydration the form is real HTML with no JavaScript
/// behind it, so pressing Enter performs a *native* submit. On the sign-in
/// form that meant a GET to `/login?email=...&password=hunter2`, putting a
/// plaintext password into the address bar, browser history, the Referer of
/// every subsequent request, and any analytics that records page URLs. Anyone
/// typing quickly or on a slow connection could hit it.
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
