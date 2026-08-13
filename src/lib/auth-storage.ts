// Where the tokens live between page loads.
//
// localStorage, not a cookie: the API is on a different origin, the app must work offline
// after a cold start, and the server's CORS allowlist does not carry credentials. The
// trade-off is that a successful XSS can read the refresh token — which is why the access
// token is short (15 min) and every refresh rotates the refresh token, so a stolen one
// stops working as soon as the real client refreshes.

const ACCESS_KEY = "podium.accessToken";
const REFRESH_KEY = "podium.refreshToken";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

let memoryFallback: Partial<TokenPair> = {};

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private mode, or storage disabled: keep the session working in memory only.
    return key === ACCESS_KEY ? (memoryFallback.accessToken ?? null) : (memoryFallback.refreshToken ?? null);
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    if (key === ACCESS_KEY) memoryFallback.accessToken = value ?? undefined;
    else memoryFallback.refreshToken = value ?? undefined;
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
