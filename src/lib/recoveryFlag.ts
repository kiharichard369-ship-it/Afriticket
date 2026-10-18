// Save as: src/lib/recoveryFlag.ts
// Imported once at the top of App.tsx.
//
// When someone opens the emailed reset link, Supabase signs them in briefly and announces
// "PASSWORD_RECOVERY". That can happen before the reset page has appeared, so this module
// listens from the very start and leaves a note the page can read.
import { supabase } from "./supabaseClient";

const KEY = "afriticket.passwordRecovery";
const VALID_FOR_MS = 60 * 60 * 1000; // the link itself expires after an hour

if (supabase) {
  supabase.auth.onAuthStateChange((event) => {
    if (event !== "PASSWORD_RECOVERY") return;
    try {
      window.sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* storage can be unavailable */
    }
  });
}

export function recoveryPending(): boolean {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const startedAt = raw ? Number(raw) : NaN;
    return Number.isFinite(startedAt) && Date.now() - startedAt < VALID_FOR_MS;
  } catch {
    return false;
  }
}

export function clearRecovery() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}