/**
 * Client-side routing hint only: never use this marker for authorization.
 * Supabase Auth must still provide a valid recovery session before updateUser.
 * Markers contain no tokens, passwords or user identifiers.
 */
const KEY = "apois-recovery-intent-v1";
const MAX_AGE_MS = 15 * 60 * 1000;

export function markPasswordRecoveryIntent() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(KEY, String(Date.now()));
}

export function hasPasswordRecoveryIntent() {
  if (typeof window === "undefined") return false;
  const stored = Number(window.sessionStorage.getItem(KEY));
  if (!Number.isFinite(stored) || stored <= 0) return false;
  if (Date.now() - stored > MAX_AGE_MS || stored > Date.now()) {
    window.sessionStorage.removeItem(KEY);
    return false;
  }
  return true;
}

export function clearPasswordRecoveryIntent() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(KEY);
}
