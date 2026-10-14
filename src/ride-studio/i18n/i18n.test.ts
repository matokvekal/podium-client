import { describe, expect, it } from "vitest";
import { QUESTIONS } from "../schema/questions";
import { en } from "./en";
import { he } from "./he";
import { formatNumber, formatStart, localeDir, STUDIO_LOCALES, t } from "./index";

describe("studio language", () => {
  it("Hebrew defines every English key, with no empty strings", () => {
    expect(Object.keys(he).sort()).toEqual(Object.keys(en).sort());
    for (const [key, value] of Object.entries(he)) expect(value.trim(), key).not.toBe("");
  });

  it("keeps the same {placeholders} in both languages", () => {
    const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[])
      expect(holes(he[key]), key).toEqual(holes(en[key]));
  });

  it("every question has its title (and hint) in every language", () => {
    for (const q of QUESTIONS) {
      for (const locale of STUDIO_LOCALES) {
        expect(t(locale, q.titleKey as keyof typeof en)).not.toBe(q.titleKey);
        if (q.hintKey) expect(t(locale, q.hintKey as keyof typeof en)).not.toBe(q.hintKey);
      }
    }
  });

  it("Hebrew is right-to-left, English left-to-right", () => {
    expect(localeDir("he")).toBe("rtl");
    expect(localeDir("en")).toBe("ltr");
  });

  it("fills placeholders and leaves unknown ones visible", () => {
    expect(t("en", "entry.resume.named", { name: "Loop" })).toBe('Continue "Loop"');
    expect(t("he", "entry.resume.named", { name: "סיבוב" })).toContain("סיבוב");
    expect(t("en", "entry.resume.named")).toContain("{name}");
  });

  it("says the dropdown hint in each language", () => {
    expect(t("en", "ui.selectFromList")).toBe("Select from the list");
    expect(t("he", "ui.selectFromList")).toBe("בחרו מהרשימה");
  });

  it("formats dates and numbers for the language", () => {
    expect(formatStart("en", "2026-10-20T06:30")).toMatch(/06:30/);
    expect(formatStart("he", "2026-10-20T06:30")).toMatch(/06:30/);
    expect(formatStart("en", "not a date")).toBe("");
    expect(formatNumber("en", 1234.5, 1)).toBe("1,234.5");
  });
});
