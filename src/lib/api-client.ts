// The single way this app talks to the server.
//
// It owns four things nothing else should have to think about:
//   1. the bearer token, and refreshing it exactly once when it expires
//   2. real HTTP status codes — 401 means re-login, 403 means not permitted,
//      409 means an offline action was already applied and IS a success
//   3. X-Client-Action-Id on mutations, so a replayed offline action cannot apply twice
//   4. turning a failure into an ApiError with a message worth showing a rider
//
// The server sends UTC in every timestamp. Converting to the viewer's local time is a
// display concern and happens in lib/time.ts, never here.

import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from "./auth-storage";
import { config } from "./config";
import {
  isServerDownStatus,
  reportServerReachable,
  reportServerUnreachable,
} from "./connectivity";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(
    status: number,
    message: string,
    code: string | null = null,
    offline = false,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.offline = offline;
  }

  /**
   * No response was received at all — a dead network, a refused connection, or a request the
   * browser itself blocked. Callers use this to mean "transport failed, so this proves nothing
   * about the session/permissions" (see AuthContext's cold start, resultsStore's local
   * fallback). It deliberately does NOT mean the device is offline — see `offline`.
   */
  get isOffline(): boolean {
    return this.status === 0;
  }

  /**
   * The browser itself says there is no network. Only this justifies telling a rider they are
   * offline; `isOffline` alone does not, and saying so on every failed request is how a CORS
   * rejection spent a debugging session disguised as a connectivity problem.
   */
  readonly offline: boolean;
}

/** Raised when the session is gone for good. The app listens for this and shows login. */
export const SESSION_EXPIRED_EVENT = "podium:session-expired";

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /**
   * UUID identifying a user action, so a retry after an outage is recognised as the same
   * action. Pass one for anything that changes data. See plan/07-api-contract.md.
   */
  clientActionId?: string;
  signal?: AbortSignal;
  /** Skips the bearer token — only for the public endpoints (auth, by-code, public lists). */
  anonymous?: boolean;
}

interface ApiEnvelope<T> {
  data?: T;
  error?: string;
  message?: string;
}

export function newClientActionId(): string {
  return crypto.randomUUID();
}

// One refresh at a time. Five parallel requests hitting a stale token must not start five
// rotations — the second one would invalidate the first and log the rider out mid-ride.
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  const response = await fetch(`${config.apiUrl}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  }).catch(() => null);

  if (!response || !response.ok) {
    // A network failure is not proof the session is dead — only the server saying so is.
    if (response) {
      clearTokens();
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }
    return false;
  }

  const tokens = (await response.json()) as { accessToken: string; refreshToken: string };
  saveTokens(tokens);
  return true;
}

function ensureRefresh(): Promise<boolean> {
  refreshInFlight ??= refreshSession().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function readError(response: Response): Promise<ApiError> {
  let code: string | null = null;
  let message = response.statusText || "Request failed";
  try {
    const body = (await response.json()) as ApiEnvelope<unknown>;
    code = body.error ?? null;
    message = body.message ?? body.error ?? message;
  } catch {
    // Not JSON — keep the status text.
  }
  return new ApiError(response.status, message, code);
}

async function send(path: string, options: RequestOptions, retryOn401: boolean): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.clientActionId) headers["X-Client-Action-Id"] = options.clientActionId;

  if (!options.anonymous) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    // fetch() rejects with the same opaque TypeError for every failure where no response came
    // back: a genuinely dead network, a refused connection, and — indistinguishably — a
    // request the BROWSER blocked before sending, which in practice means CORS. Claiming
    // "you appear to be offline" for all three is a lie in two of them, and it is exactly how
    // a preflight the browser rejected (server answered the OPTIONS, then no PATCH was ever
    // sent) surfaced to a rider as a connectivity problem instead of the real cause.
    //
    // navigator.onLine is the only thing here that actually knows about the network, so it is
    // the only thing allowed to produce the offline MESSAGE. Whether the SERVER is reachable is
    // a separate question, and no response at all answers it: unreachable, whatever the cause.
    reportServerUnreachable();
    const offline = navigator.onLine === false;
    if (!offline) {
      console.error(
        `Request to ${config.apiUrl}${path} never reached the server, but the browser reports it is online. ` +
          `Most often this is CORS: the API must answer with Access-Control-Allow-Origin for ${window.location.origin}. ` +
          `Otherwise the API is not listening on ${config.apiUrl}.`,
        err,
      );
    }
    throw new ApiError(
      0,
      offline
        ? "You appear to be offline"
        : `Could not reach the server at ${config.apiUrl}. See the browser console for details.`,
      null,
      offline,
    );
  }

  // A response — of any status — proves the server answered. The one exception is a gateway
  // reporting the application behind it is down, which is "offline" as far as a rider is
  // concerned. See lib/connectivity.ts for why this split is drawn exactly here.
  if (isServerDownStatus(response.status)) {
    reportServerUnreachable();
  } else {
    reportServerReachable();
  }

  if (response.status === 401 && retryOn401 && !options.anonymous) {
    // Only a viewer who HAD a session can lose one.
    //
    // A guest browsing a public ride holds no tokens at all, and a 401 off an
    // authenticated-only endpoint (the start list, say) is simply the honest answer to "you
    // are not signed in" — nothing expired. Treating it as an expiry signed nobody out, but it
    // DID dispatch SESSION_EXPIRED, which AuthContext handles with a hard
    // window.location.replace("/login") — rebooting the whole SPA and replaying the splash
    // video. That is the "tap a ride as a stranger and the app restarts" bug: the guest never
    // saw the ride, just the intro clip and a login screen.
    //
    // With no session to recover, the 401 is returned as-is and the caller's own catch decides
    // what it means (EventDetailPage keeps its roster placeholder, the CTA still says "Sign in
    // to join"). Only a viewer who actually holds tokens can reach the expiry path below.
    if (getRefreshToken()) {
      const refreshed = await ensureRefresh();
      if (refreshed) return send(path, options, false);
      clearTokens();
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    } else if (getAccessToken()) {
      // Tokens half-present: an access token with no refresh token cannot be recovered, so
      // this session really is over. Same reset as above.
      clearTokens();
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }
  }

  return response;
}

/**
 * Performs a request and unwraps the `{ data }` envelope the API uses for everything built
 * for this app. The frozen transmitter endpoints answer with a bare object instead, so an
 * unwrapped body is returned as-is rather than treated as an error.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await send(path, options, true);

  if (response.status === 204) return undefined as T;

  if (!response.ok) throw await readError(response);

  const body = (await response.json()) as ApiEnvelope<T> | T;
  if (body && typeof body === "object" && "data" in body) {
    return (body as ApiEnvelope<T>).data as T;
  }
  return body as T;
}

/** A page of a list endpoint, plus the server's own count of everything that matched. */
export interface ApiPage<T> {
  data: T[];
  total: number;
}

/**
 * Like apiRequest, but keeps `total` instead of throwing it away.
 *
 * apiRequest unwraps the `{ data }` envelope, which is right for every single-resource read
 * and for a list nobody pages. It is why the two paged endpoints this app has are both used
 * unpaged today: eventsStore asks for `limit=100` once and calls that the whole list, and
 * tracksStore asks for `pageSize=60` and says in its own comment that real paging is a later
 * job. Neither can page, because the count needed to know when to stop is discarded one line
 * before they see it.
 *
 * So this is a sibling, not a change to apiRequest — every existing caller keeps its exact
 * behaviour. `total` is only trustworthy from an endpoint that actually sends it
 * (GET /events/public, GET /routes/public); anything else reports the page's own length,
 * which makes "there is no more" the safe answer rather than an infinite scroll that never
 * ends.
 */
export async function apiRequestPaged<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiPage<T>> {
  const response = await send(path, options, true);

  if (!response.ok) throw await readError(response);

  const body = (await response.json()) as { data?: T[]; total?: unknown };
  const data = Array.isArray(body?.data) ? body.data : [];
  const total = typeof body?.total === "number" ? body.total : data.length;
  return { data, total };
}

/**
 * For mutations that were queued offline. A 409 means the server already applied this exact
 * action id — the rider's intent happened, so it is a success, not an error to show them.
 */
export async function apiMutate<T>(
  path: string,
  options: RequestOptions & { method: "POST" | "PATCH" | "PUT" | "DELETE" },
): Promise<{ result: T; alreadyApplied: boolean }> {
  const clientActionId = options.clientActionId ?? newClientActionId();
  const response = await send(path, { ...options, clientActionId }, true);

  if (response.status === 409) {
    const body = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
    return { result: body.data as T, alreadyApplied: true };
  }

  if (!response.ok) throw await readError(response);
  if (response.status === 204) return { result: undefined as T, alreadyApplied: false };

  const body = (await response.json()) as ApiEnvelope<T> | T;
  const result =
    body && typeof body === "object" && "data" in body
      ? ((body as ApiEnvelope<T>).data as T)
      : (body as T);
  return { result, alreadyApplied: false };
}
