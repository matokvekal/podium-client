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

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }

  /** The request never left the device — worth saying "you are offline" rather than "failed". */
  get isOffline(): boolean {
    return this.status === 0;
  }
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
    throw new ApiError(0, "You appear to be offline");
  }

  if (response.status === 401 && retryOn401 && !options.anonymous) {
    const refreshed = await ensureRefresh();
    if (refreshed) return send(path, options, false);
    clearTokens();
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
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
