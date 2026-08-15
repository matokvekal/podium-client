// Where the tokens live between page loads.
//
// localStorage, not a cookie: the API is on a different origin, the app must work offline
// after a cold start, and the server's CORS allowlist does not carry credentials. The
// trade-off is that a successful XSS can read the refresh token — which is why the access
// token is short (15 min) and every refresh rotates the refresh token, so a stolen one
// stops working as soon as the real client refreshes.

const ACCESS_KEY = "podium.accessToken";
const REFRESH_KEY = "podium.refreshToken";
const PROFILE_KEY = "podium.profile";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

let memoryFallback: Record<string, string | undefined> = {};

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private mode, or storage disabled: keep the session working in memory only.
    return memoryFallback[key] ?? null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    memoryFallback[key] = value ?? undefined;
  }
}

export function getAccessToken(): string | null {
  return read(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return read(REFRESH_KEY);
}

export function saveTokens(tokens: TokenPair): void {
  write(ACCESS_KEY, tokens.accessToken);
  write(REFRESH_KEY, tokens.refreshToken);
}

export function clearTokens(): void {
  write(ACCESS_KEY, null);
  write(REFRESH_KEY, null);
  memoryFallback = {};
}

export function hasSession(): boolean {
  return getRefreshToken() !== null;
}

/**
 * The last profile we successfully loaded, so a cold start with no network can still show
 * who is signed in instead of showing nothing (or worse, forcing a re-login — see
 * AuthContext's cold-start effect). Deliberately untyped here: AuthContext owns the shape.
 */
export function getProfile<T>(): T | null {
  const raw = read(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function saveProfile(profile: unknown): void {
  write(PROFILE_KEY, JSON.stringify(profile));
}

export function clearProfile(): void {
  write(PROFILE_KEY, null);
}
