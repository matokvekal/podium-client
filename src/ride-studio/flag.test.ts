import { describe, expect, it, vi } from "vitest";
import {
  isRideStudioEnabled,
  RIDE_CREATE_METHOD_KEY,
  readCreateMethod,
  writeCreateMethod,
} from "./flag";
import { parseRuntimeConfig, startRuntimeConfig } from "./runtime-config";

const user = { userId: 42, canOrganize: true };

describe("who sees Ride Studio", () => {
  it("every organizer, with nothing switched on", () => {
    expect(isRideStudioEnabled(user, {})).toBe(true);
    expect(isRideStudioEnabled({ userId: 7, canOrganize: true }, {})).toBe(true);
  });

  it("never for a signed-out visitor or someone who cannot organize", () => {
    expect(isRideStudioEnabled({ userId: null, canOrganize: true }, {})).toBe(false);
    expect(isRideStudioEnabled({ userId: 42, canOrganize: false }, {})).toBe(false);
    expect(isRideStudioEnabled({ userId: 42, canOrganize: false }, { override: "on" })).toBe(false);
  });

  it("an unknown permission is not a denial (the server still decides)", () => {
    expect(isRideStudioEnabled({ userId: 42, canOrganize: undefined }, {})).toBe(true);
  });

  it("the emergency switch turns it off for everyone, whatever else is set", () => {
    expect(isRideStudioEnabled(user, { killSwitch: false })).toBe(false);
    expect(isRideStudioEnabled(user, { killSwitch: false, override: "on" })).toBe(false);
    expect(isRideStudioEnabled(user, { killSwitch: true })).toBe(true);
  });

  it("a build with VITE_RIDE_STUDIO=off, or one browser's own opt-out, turns it off", () => {
    expect(isRideStudioEnabled(user, { build: "off" })).toBe(false);
    expect(isRideStudioEnabled(user, { override: "off" })).toBe(false);
    expect(isRideStudioEnabled(user, { build: "all" })).toBe(true);
  });
});

describe("the emergency switch file", () => {
  it("only an explicit enabled:false turns it off", () => {
    expect(parseRuntimeConfig({ enabled: false })).toBe(false);
    expect(parseRuntimeConfig({ enabled: true })).toBe(true);
    expect(parseRuntimeConfig({})).toBe(true);
    expect(parseRuntimeConfig(null)).toBe(true);
    expect(parseRuntimeConfig("off")).toBe(true);
    expect(parseRuntimeConfig({ enabled: "false" })).toBe(true);
    expect(parseRuntimeConfig({ enabled: 0 })).toBe(true);
  });

  it("is read fresh, and a failed or unusable read leaves the studio on", async () => {
    const { getRuntimeSwitch, resetRuntimeConfigForTests } = await import("./runtime-config");

    resetRuntimeConfigForTests();
    const off = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ enabled: false }) });
    startRuntimeConfig(off as unknown as typeof fetch);
    await vi.waitFor(() => expect(getRuntimeSwitch()).toEqual({ enabled: false, settled: true }));
    const [url, init] = off.mock.calls[0];
    expect(String(url)).toMatch(/^\/ride-studio-config\.json\?t=\d+$/);
    expect(init.cache).toBe("no-store");

    resetRuntimeConfigForTests();
    startRuntimeConfig(vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch);
    await vi.waitFor(() => expect(getRuntimeSwitch()).toEqual({ enabled: true, settled: true }));

    resetRuntimeConfigForTests();
    const html = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError("<!doctype html>");
      },
    });
    startRuntimeConfig(html as unknown as typeof fetch);
    await vi.waitFor(() => expect(getRuntimeSwitch()).toEqual({ enabled: true, settled: true }));

    resetRuntimeConfigForTests();
    startRuntimeConfig(
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as unknown as typeof fetch,
    );
    await vi.waitFor(() => expect(getRuntimeSwitch()).toEqual({ enabled: true, settled: true }));
  });
});

describe("the remembered creation method", () => {
  function store(): Storage {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    } as unknown as Storage;
  }

  it("round-trips, and clears", () => {
    const s = store();
    expect(readCreateMethod(s)).toBeNull();
    writeCreateMethod("studio", s);
    expect(readCreateMethod(s)).toBe("studio");
    writeCreateMethod("normal", s);
    expect(readCreateMethod(s)).toBe("normal");
    writeCreateMethod(null, s);
    expect(readCreateMethod(s)).toBeNull();
  });

  it("ignores a value it does not know, and storage that throws", () => {
    const s = store();
    s.setItem(RIDE_CREATE_METHOD_KEY, "banana");
    expect(readCreateMethod(s)).toBeNull();
    const broken = {
      getItem: () => {
        throw new Error("x");
      },
      setItem: () => {
        throw new Error("x");
      },
    } as unknown as Storage;
    expect(readCreateMethod(broken)).toBeNull();
    expect(() => writeCreateMethod("studio", broken)).not.toThrow();
  });
});
