// Client-side auth stub. Wire to Lovable Cloud (Supabase) to make it real.
const KEY = "flowerp_authed";

export function isAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function signInLocal() {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {}
}

export function signOutLocal() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {}
}
