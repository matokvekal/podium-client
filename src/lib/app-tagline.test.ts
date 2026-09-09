import { describe, expect, it } from "vitest";
import { appTagline, TAGLINES, taglineLanguage } from "./app-tagline";

describe("taglineLanguage", () => {
  it("uses the picked country before the device locale", () => {
    expect(taglineLanguage("IL", ["en-US"])).toBe("he");
    expect(taglineLanguage("ES", ["en-US"])).toBe("es");
    expect(taglineLanguage("DE", ["en-US"])).toBe("de");
  });

  it("treats Austria and Switzerland as German", () => {
    expect(taglineLanguage("AT", [])).toBe("de");
    expect(taglineLanguage("CH", [])).toBe("de");
  });

  it("falls back to the device locale for a country we have no line for", () => {
    // France is in the picker but has no French line — the phone decides instead.
    expect(taglineLanguage("FR", ["he-IL"])).toBe("he");
    expect(taglineLanguage("BR", ["ja-JP"])).toBe("ja");
  });

  it("reaches Japanese and Chinese riders through the locale, which the picker cannot", () => {
    expect(taglineLanguage(null, ["ja-JP", "en-US"])).toBe("ja");
    expect(taglineLanguage(null, ["zh-CN"])).toBe("zh");
    expect(taglineLanguage(null, ["zh-TW"])).toBe("zh");
  });

  it("honours the browser's order of preference", () => {
    expect(taglineLanguage(null, ["fr-FR", "de-DE", "en-US"])).toBe("de");
  });

  it("understands the legacy Hebrew subtag", () => {
    expect(taglineLanguage(null, ["iw-IL"])).toBe("he");
  });

  it("lands on English with nothing to go on, or on junk", () => {
    expect(taglineLanguage(null, [])).toBe("en");
    expect(taglineLanguage("ZZ", ["kl-GL"])).toBe("en");
    expect(taglineLanguage(undefined, [""])).toBe("en");
  });
});

describe("appTagline", () => {
  it("marks Hebrew as RTL and everything else as LTR", () => {
    expect(appTagline("IL", [])).toEqual({
      text: TAGLINES.he,
      language: "he",
      dir: "rtl",
    });
    expect(appTagline("US", []).dir).toBe("ltr");
  });

  it("carries the text for the language it picked", () => {
    expect(appTagline(null, []).text).toBe("The app for community rides");
    expect(appTagline(null, ["es-ES"]).text).toBe("La app para salidas en bici en grupo");
    expect(appTagline(null, ["zh-CN"]).text).toBe("社交骑行应用");
  });
});
