// Runs in plain node, like every other test here — this project has no jsdom/happy-dom and
// does not need one for four functions that touch two browser APIs. `window.localStorage` and
// `document.documentElement` are stubbed below, which also keeps the assertions honest: the
// test asserts exactly which API was reached and which was not.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyColorTheme, getInitialColorTheme, saveColorTheme } from "./color-theme";

const KEY = "elnino.color-theme.v2";
const LEGACY_KEY = "elnino.color-theme";

let store: Map<string, string>;
let attributes: Map<string, string>;
let matchMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  store = new Map();
  attributes = new Map();
  // Reports a dark operating system on every query, so any test that comes out "day" proves
  // the preference was ignored rather than merely absent.
  matchMedia = vi.fn(() => ({ matches: true }));

  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
    },
    matchMedia,
  });
  vi.stubGlobal("document", {
    documentElement: {
      setAttribute: (key: string, value: string) => void attributes.set(key, value),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getInitialColorTheme", () => {
  it("defaults to day and never consults the operating system", () => {
    // The point of the whole change: a stranger opening an organizer's invitation link on a
    // dark phone gets the daylight app every screenshot and mockup was designed against, not a
    // dark one they never asked for.
    expect(getInitialColorTheme()).toBe("day");
    expect(matchMedia).not.toHaveBeenCalled();
  });

  it("honours a theme the rider actually chose", () => {
    saveColorTheme("dark");
    expect(getInitialColorTheme()).toBe("dark");
    saveColorTheme("day");
    expect(getInitialColorTheme()).toBe("day");
  });

  it("ignores the legacy key, which cannot be told apart from an OS-derived default", () => {
    // The old applyColorTheme persisted on EVERY call, including the one that applied a
    // prefers-color-scheme default. So devices carry a "dark" under the old key that nobody
    // ever picked, and reading it would keep them dark forever — which is exactly why
    // defaulting to day appeared to do nothing on a phone that had opened the app before.
    store.set(LEGACY_KEY, "dark");
    expect(getInitialColorTheme()).toBe("day");
  });

  it("falls back to day when storage holds something meaningless", () => {
    store.set(KEY, "midnight");
    expect(getInitialColorTheme()).toBe("day");
  });

  it("survives storage throwing, as it does in some private modes", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("SecurityError");
        },
      },
      matchMedia,
    });
    expect(getInitialColorTheme()).toBe("day");
  });
});

describe("applyColorTheme", () => {
  it("paints the theme without remembering it", () => {
    applyColorTheme("dark");
    expect(attributes.get("data-color-theme")).toBe("dark");
    // Applying a default must never look like a choice — conflating the two is the bug this
    // split exists to prevent, so the next visit still starts at the default.
    expect(store.get(KEY)).toBeUndefined();
    expect(getInitialColorTheme()).toBe("day");
  });
});

describe("saveColorTheme", () => {
  it("is what makes a choice stick across visits", () => {
    saveColorTheme("dark");
    expect(store.get(KEY)).toBe("dark");
    expect(getInitialColorTheme()).toBe("dark");
  });

  it("does not throw when storage is unavailable", () => {
    vi.stubGlobal("window", {
      localStorage: {
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
    });
    expect(() => saveColorTheme("dark")).not.toThrow();
  });
});
