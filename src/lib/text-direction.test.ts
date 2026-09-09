// Direction is decided by DOMINANT SCRIPT rather than the first strong character, which is what
// the platform's own dir="auto" uses. The cases that matter are the ones where those two
// disagree — a Hebrew ride description that happens to open with a Latin word is the realistic
// one, and it is the reason this function exists instead of an attribute.

import { describe, expect, it } from "vitest";
import { detectTextDirection } from "./text-direction";

describe("detectTextDirection", () => {
  it("reads a Hebrew ride description as rtl", () => {
    expect(detectTextDirection("יציאה בשעה 06:00 מאזור המרכז, המסלול כולל מספר עליות קשות")).toBe(
      "rtl",
    );
  });

  it("reads an English ride description as ltr", () => {
    expect(detectTextDirection("We leave at 06:00 from the center. Several climbs.")).toBe("ltr");
  });

  it("reads Arabic as rtl", () => {
    expect(detectTextDirection("نبدأ الساعة السادسة صباحا من المركز")).toBe("rtl");
  });

  it("stays rtl when a Hebrew description opens with a Latin word — the dir=auto trap", () => {
    // dir="auto" settles on the first strong character, so "Strava" alone would flip this whole
    // paragraph to ltr and strand its punctuation on the wrong side.
    expect(detectTextDirection("Strava: יציאה בשעה 06:00 מהמרכז ונמשיך צפונה בכביש 40")).toBe(
      "rtl",
    );
  });

  it("stays ltr when an English description quotes a couple of Hebrew words", () => {
    expect(
      detectTextDirection("Meeting point is the כיכר by the station, then north for 40km."),
    ).toBe("ltr");
  });

  it("falls back to ltr for text with no letters at all", () => {
    // A time, a distance and an emoji carry no directional signal; ltr is the app's own default
    // (index.html is lang="en"), so this renders as it always has rather than flipping.
    expect(detectTextDirection("06:00 ⛰️ 🚴 (50km)")).toBe("ltr");
  });

  it("falls back to ltr for empty and whitespace-only text", () => {
    expect(detectTextDirection("")).toBe("ltr");
    expect(detectTextDirection("   \n  ")).toBe("ltr");
  });

  it("breaks an exact tie towards ltr", () => {
    expect(detectTextDirection("abc אבג")).toBe("ltr");
  });
});
