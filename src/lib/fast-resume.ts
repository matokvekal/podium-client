// Fast Resume — reopening the installed app lands back where you were, without the splash.
//
// THE PROBLEM IT SOLVES
//   An installed PWA always opens at the manifest's `start_url` ("/"), and SplashScreen plays
//   its clip once per cold start. For someone checking the app four times in a morning, both
//   are right the first time and wrong every time after: three seconds of video and a bounce
//   back to the ride list, away from the ride they were actually looking at.
//
// WHAT IT IS NOT
//   Not a session, and not a shortcut around one. The stored state is a ROUTE and a
//   TIMESTAMP — nothing about who the rider is, and nothing that any code here treats as
//   proof of anything. `hasSession()` (real tokens, in lib/auth-storage.ts) is still what says
//   a rider is signed in, RequireAuth still guards every screen, and the server still answers
//   401 to a token it does not like. Deleting this module's key can only cost a rider three
//   seconds of video; it can never let anyone in.
//
// THE DECISION IS TAKEN ONCE, AT BOOT
//   `fastResumeRoute()` answers from a snapshot read when this module is first imported —
//   before React renders. Two things consume it (SplashScreen, app/FastResume.tsx) and they
//   must agree; reading storage twice would let the second reader see the first navigation's
//   own freshly-written timestamp and resume from state that was actually 3 days old.
//
// Stored under an `elnino.` key ON PURPOSE: logout's prefix scan (lib/logout-cleanup.ts) then
// clears it with everything else this app owns, so there is no second cleanup path to forget.

import { hasSession } from "./auth-storage";

/**
 * THE KILL SWITCH. Set to false and the app behaves exactly as it did before Fast Resume
 * existed: nothing is written, nothing is read, the splash plays on every cold start and
 * every launch opens at "/".
 *
 * A constant rather than an env var deliberately — flipping it is a one-line diff with the
 * same deploy either way, and it cannot be half-set between the build and the running app.
 */
export const FAST_RESUME_ENABLED = true;

/** `elnino.` so logout's owned-prefix scan takes it. See the header note. */
export const FAST_RESUME_STORAGE_KEY = "elnino.fast-resume";

/**
 * How stale the last visit may be. Twelve hours is "earlier today, or last night" — the window
 * in which landing back on the ride you were looking at is obviously right. Past it, the app
 * has no business guessing, and opening at the ride list is the honest answer.
 */
export const RESUME_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface ResumeState {
  /** An in-app path, with its query if it had one. Never a full URL. */
  route: string;
  /** Epoch ms of the last navigation (or of the app being backgrounded). */
  lastActive: number;
}

/**
 * Routes that must never be restored.
 *
 * Sign-in and the profile-setup detour are places the app SENDS people, not places they were;
 * resuming onto one is how a redirect loop starts. "/logout" and "/auth/..." do not exist in
 * this app today and are listed anyway, because the cost of naming them now is nothing and the
 * cost of a future auth callback quietly becoming resumable is a loop nobody can get out of.
 */
const UNSAFE_PREFIXES = ["/login", "/logout", "/auth", "/account/setup"];

/**
 * Is this something the app may navigate to on its own?
 *
 * Deliberately strict: an in-app absolute path and nothing else. "//evil.example" is a
 * protocol-relative URL that a router would happily treat as a path and a browser would treat
 * as another origin, and a backslash is read as a separator by enough parsers to be worth
 * refusing outright. Everything here is about what we WRITE to storage as much as what we read
 * back — a value that never gets stored cannot be tampered into a redirect.
 */
export function isSafeResumeRoute(route: unknown): route is string {
  if (typeof route !== "string" || route.length === 0) return false;
  if (!route.startsWith("/")) return false;
  if (route.startsWith("//") || route.includes("\\")) return false;
  const path = route.split(/[?#]/, 1)[0];
  return !UNSAFE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** Pure: the stored JSON, or null for anything that is not a resume state we wrote. */
export function parseResumeState(raw: string | null): ResumeState | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { route, lastActive } = parsed as { route?: unknown; lastActive?: unknown };
    if (!isSafeResumeRoute(route)) return null;
    if (typeof lastActive !== "number" || !Number.isFinite(lastActive)) return null;
    return { route, lastActive };
  } catch {
    return null;
  }
}

/**
 * The whole rule, as one pure function — which is why it takes everything it needs instead of
 * reading any of it.
 *
 * A `lastActive` in the FUTURE fails too. It means the device clock moved backwards (or the
 * value was edited), and "0 ms ago" would otherwise be the one age that never expires.
 */
export function resumeRouteFor(
  state: ResumeState | null,
  options: { now: number; signedIn: boolean; enabled?: boolean },
): string | null {
  const { now, signedIn, enabled = FAST_RESUME_ENABLED } = options;
  if (!enabled || !signedIn || !state) return null;
  const age = now - state.lastActive;
  if (age < 0 || age > RESUME_MAX_AGE_MS) return null;
  return state.route;
}

function readStored(): ResumeState | null {
  try {
    return parseResumeState(window.localStorage.getItem(FAST_RESUME_STORAGE_KEY));
  } catch {
    // Storage unavailable (private mode, disabled). No resume state is a perfectly good
    // answer — the app simply starts the way it always has.
    return null;
  }
}

export function clearResumeState(): void {
  try {
    window.localStorage.removeItem(FAST_RESUME_STORAGE_KEY);
  } catch {
    // Nothing to do: worst case a stale route stays on the device and is refused on age.
  }
}

/**
 * Remember where the rider is. Called on navigation and when the app is backgrounded, both of
 * which are moments that already happened — no timer keeps this fresh.
 *
 * An unsafe route is not written at all, so /login never becomes the thing we resume to.
 */
export function recordResumeState(route: string, now: number = Date.now()): void {
  if (!FAST_RESUME_ENABLED) return;
  if (!isSafeResumeRoute(route)) return;
  try {
    const state: ResumeState = { route, lastActive: now };
    window.localStorage.setItem(FAST_RESUME_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable — Fast Resume simply does not happen next time.
  }
}

/**
 * The boot snapshot: the route to resume to, or null for a normal startup.
 *
 * Computed at import, ONCE, for the reason in the header note. State that fails any part of
 * the rule is deleted on the spot rather than left to fail the same way tomorrow.
 */
const bootResumeRoute: string | null = (() => {
  if (typeof window === "undefined") return null;
  const state = readStored();
  const route = FAST_RESUME_ENABLED
    ? resumeRouteFor(state, { now: Date.now(), signedIn: hasSession() })
    : null;
  if (state !== null && route === null) clearResumeState();
  return route;
})();

export function fastResumeRoute(): string | null {
  return bootResumeRoute;
}
