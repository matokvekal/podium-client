import { describe, expect, it } from "vitest";
import { createGenerationGuard } from "./generation-guard";

describe("createGenerationGuard", () => {
  it("a token is current until a newer one is taken", () => {
    const guard = createGenerationGuard();
    const a = guard.next();
    expect(guard.isCurrent(a)).toBe(true);
    const b = guard.next();
    expect(guard.isCurrent(a)).toBe(false);
    expect(guard.isCurrent(b)).toBe(true);
  });

  it("models the actual bug: a slow fetch's result must not land after a newer choice", () => {
    const guard = createGenerationGuard();

    // Organizer picks an old track — its background fetch for full geometry starts.
    const oldFetchToken = guard.next();

    // Before that fetch resolves, they upload their own GPX instead.
    guard.next();

    // The old fetch finally resolves. Its result must be discarded, not applied.
    expect(guard.isCurrent(oldFetchToken)).toBe(false);
  });

  it("a fetch that resolves before anything newer starts is still applied", () => {
    const guard = createGenerationGuard();
    const token = guard.next();
    expect(guard.isCurrent(token)).toBe(true);
  });

  it("independent guards never see each other's tokens", () => {
    const a = createGenerationGuard();
    const b = createGenerationGuard();
    const tokenA = a.next();
    expect(b.isCurrent(tokenA)).toBe(false);
  });
});
