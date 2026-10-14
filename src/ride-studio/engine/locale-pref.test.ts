import { describe, expect, it } from "vitest";
import {
  effectiveStudioLocale,
  LOCALE_PREF_KEY,
  readLocalePref,
  writeLocalePref,
} from "./locale-pref";

function memory(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
  } as Storage;
}

describe("the studio language", () => {
  it("an explicit choice wins over the country default", () => {
    const store = memory({ [LOCALE_PREF_KEY]: "en" });
    expect(effectiveStudioLocale("IL", store)).toBe("en");
    expect(effectiveStudioLocale("US", memory({ [LOCALE_PREF_KEY]: "he" }))).toBe("he");
  });

  it("without a choice, the country decides, and English is the fallback", () => {
    expect(effectiveStudioLocale("IL", memory())).toBe("he");
    expect(effectiveStudioLocale("FR", memory())).toBe("en");
  });

  it("remembers a choice and ignores junk", () => {
    const store = memory();
    writeLocalePref("he", store);
    expect(readLocalePref(store)).toBe("he");
    expect(readLocalePref(memory({ [LOCALE_PREF_KEY]: "fr" }))).toBeNull();
  });

  it("works without storage", () => {
    expect(readLocalePref(null)).toBeNull();
    expect(() => writeLocalePref("en", null)).not.toThrow();
  });
});
