import { describe, expect, it } from "vitest";
import {
  isRideStudioEnabled,
  RIDE_CREATE_METHOD_KEY,
  readCreateMethod,
  writeCreateMethod,
} from "./flag";

const user = { userId: 42, canOrganize: true };

describe("who sees Ride Studio", () => {
  it("nobody by default", () => {
    expect(isRideStudioEnabled(user, {})).toBe(false);
  });

  it("only the listed users", () => {
    expect(isRideStudioEnabled(user, { userIds: "7, 42 ,9" })).toBe(true);
    expect(isRideStudioEnabled({ ...user, userId: 8 }, { userIds: "7,42,9" })).toBe(false);
    expect(isRideStudioEnabled(user, { userIds: "" })).toBe(false);
  });

  it("everyone who can organize once released", () => {
    expect(isRideStudioEnabled(user, { all: "all" })).toBe(true);
    expect(isRideStudioEnabled({ ...user, canOrganize: false }, { all: "all" })).toBe(false);
  });

  it("never for a signed-out visitor or someone who cannot organize, even when forced on", () => {
    expect(isRideStudioEnabled({ userId: null, canOrganize: true }, { override: "on" })).toBe(
      false,
    );
    expect(isRideStudioEnabled({ userId: 42, canOrganize: false }, { override: "on" })).toBe(false);
  });

  it("an unknown permission is not a denial", () => {
    expect(isRideStudioEnabled({ userId: 42, canOrganize: undefined }, { userIds: "42" })).toBe(
      true,
    );
  });

  it("the stored override wins in both directions", () => {
    expect(isRideStudioEnabled(user, { override: "on" })).toBe(true);
    expect(isRideStudioEnabled(user, { override: "off", userIds: "42", all: "all" })).toBe(false);
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
