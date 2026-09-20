// A 429 tells the caller how long to wait; ApiError must carry it so the gallery can honour it.
// Sources, in order: `Retry-After` (seconds or an HTTP date), then the rate limiter's own
// `RateLimit-Reset`. Only a 429 carries it — no other status invents a wait.

import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequestPaged } from "./api-client";

function respond(status: number, headers: Record<string, string>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ error: "x" }), { status, headers })),
  );
}

async function refusal(status: number, headers: Record<string, string>): Promise<ApiError> {
  respond(status, headers);
  try {
    await apiRequestPaged("/events/public", { anonymous: true });
  } catch (err) {
    return err as ApiError;
  }
  throw new Error("expected a rejection");
}

afterEach(() => vi.unstubAllGlobals());

describe("ApiError.retryAfterSeconds", () => {
  it("reads Retry-After in seconds", async () => {
    const err = await refusal(429, { "Retry-After": "93" });
    expect(err.status).toBe(429);
    expect(err.retryAfterSeconds).toBe(93);
  });

  it("reads Retry-After as an HTTP date", async () => {
    const at = new Date(Date.now() + 42_000).toUTCString();
    const err = await refusal(429, { "Retry-After": at });
    expect(err.retryAfterSeconds).toBeGreaterThanOrEqual(40);
    expect(err.retryAfterSeconds).toBeLessThanOrEqual(43);
  });

  it("falls back to the rate limiter's RateLimit-Reset", async () => {
    const err = await refusal(429, { "RateLimit-Reset": "120" });
    expect(err.retryAfterSeconds).toBe(120);
  });

  it("is null when the 429 names no wait, or names nonsense", async () => {
    expect((await refusal(429, {})).retryAfterSeconds).toBeNull();
    expect((await refusal(429, { "Retry-After": "soon" })).retryAfterSeconds).toBeNull();
  });

  it("is null for every status that is not a 429", async () => {
    const err = await refusal(503, { "Retry-After": "10" });
    expect(err.status).toBe(503);
    expect(err.retryAfterSeconds).toBeNull();
  });
});
