// Device-level visitor identity + a lightweight session id, for the PAGE_VIEW traffic beacon
// (app/PageViewTracker.tsx). Deliberately NOT under `elnino.`/`podium.` — those prefixes are
// swept by logout-cleanup.ts on sign-out, and a visitor's identity is about the DEVICE, not the
// account: it must survive signing out and back in on the same browser, or every logout would
// look like a brand-new anonymous visitor in the traffic numbers.

const VISITOR_ID_KEY = "av.visitorId";
const SESSION_KEY = "av.session";

/** A session ends after this much inactivity — the spec's "roughly 30 minutes" rule. */
export const SESSION_IDLE_MS = 30 * 60 * 1000;

interface StoredSession {
  id: string;
  lastActiveAt: number;
}

let memoryFallback: Record<string, string | undefined> = {};

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private mode, or storage disabled — keep working in memory only, for this tab's lifetime.
    return memoryFallback[key] ?? null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    memoryFallback[key] = value;
  }
}

function newId(): string {
  return crypto.randomUUID();
}

/** Generated once per device/browser, then reused for every visit. */
export function getVisitorId(): string {
  const existing = read(VISITOR_ID_KEY);
  if (existing) return existing;
  const id = newId();
  write(VISITOR_ID_KEY, id);
  return id;
}

function parseSession(raw: string | null): StoredSession | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { id, lastActiveAt } = parsed as { id?: unknown; lastActiveAt?: unknown };
    if (typeof id !== "string" || !id) return null;
    if (typeof lastActiveAt !== "number" || !Number.isFinite(lastActiveAt)) return null;
    return { id, lastActiveAt };
  } catch {
    return null;
  }
}

/**
 * Reuses the current session id if it was last active within SESSION_IDLE_MS, otherwise starts
 * a new one. Every call refreshes `lastActiveAt` — this is deliberately not a pure read, the
 * same way recordResumeState (fast-resume.ts) writes on every navigation it observes.
 */
export function getOrCreateSessionId(now: number = Date.now()): string {
  const stored = parseSession(read(SESSION_KEY));
  const id = stored && now - stored.lastActiveAt <= SESSION_IDLE_MS ? stored.id : newId();
  write(SESSION_KEY, JSON.stringify({ id, lastActiveAt: now } satisfies StoredSession));
  return id;
}
