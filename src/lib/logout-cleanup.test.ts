import { describe, expect, it } from "vitest";
import { COLOR_THEME_STORAGE_KEY } from "./color-theme";
import { isOwnedStorageKey, ownedStorageKeys } from "./logout-cleanup";

describe("isOwnedStorageKey", () => {
  it("owns every user-specific podium.* and elnino.* key", () => {
    expect(isOwnedStorageKey("podium.accessToken")).toBe(true);
    expect(isOwnedStorageKey("podium.userMode")).toBe(true);
    expect(isOwnedStorageKey("podium.userIdentity")).toBe(true);
    expect(isOwnedStorageKey("elnino.location-stopped.abc-123")).toBe(true);
    expect(isOwnedStorageKey("elnino.approval-seen.xyz")).toBe(true);
  });

  it("preserves the colour theme — a device preference, not user data", () => {
    // Read from the constant, never retyped. A copy of this string here is what let logout
    // start wiping the theme when color-theme.ts moved to its v2 key: the literal still
    // matched an old key nothing used any more, and the real one fell through to "owned".
    expect(isOwnedStorageKey(COLOR_THEME_STORAGE_KEY)).toBe(false);
  });

  it("no longer spares the dead pre-v2 theme key", () => {
    // Nothing reads it, so logout may as well clear it off the device.
    expect(isOwnedStorageKey("elnino.color-theme")).toBe(true);
  });

  it("does not touch anything else", () => {
    expect(isOwnedStorageKey("G_AUTHUSER_H")).toBe(false);
    expect(isOwnedStorageKey("__stripe_mid")).toBe(false);
    expect(isOwnedStorageKey("theme")).toBe(false);
    expect(isOwnedStorageKey("podiumish.token")).toBe(false); // prefix must be exact
    expect(isOwnedStorageKey("myPodium.x")).toBe(false);
  });
});

describe("ownedStorageKeys", () => {
  it("filters a real-world key set down to only this app's keys", () => {
    const all = [
      "podium.accessToken",
      "podium.refreshToken",
      "podium.profile",
      "podium.userMode",
      "podium.eventGroups",
      COLOR_THEME_STORAGE_KEY,
      "G_AUTHUSER_H",
      "some-other-app.data",
    ];
    expect(ownedStorageKeys(all).sort()).toEqual(
      [
        "podium.accessToken",
        "podium.eventGroups",
        "podium.profile",
        "podium.refreshToken",
        "podium.userMode",
      ].sort(),
    );
  });

  it("returns an empty list when nothing matches", () => {
    expect(ownedStorageKeys(["a", "b", "c"])).toEqual([]);
  });
});
