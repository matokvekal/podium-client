import { describe, expect, it } from "vitest";
import { QUESTIONS } from "../schema/questions";
import { createDraft, parseStoredDraft } from "./draft";
import { applyAnswers, markAnswered } from "./flow";
import { messageTier, progressSegments, progressSummary } from "./progress";
import type { Answer, RideDraft } from "./types";

const base = (): RideDraft =>
  createDraft({
    locale: "en",
    country: "IL",
    now: 1,
    submissionId: "11111111-1111-4111-8111-111111111111",
  });
const ui = (questionId: string, field: Answer["field"], value: unknown): Answer => ({
  questionId,
  field,
  value,
  source: "ui",
});
const apply = (d: RideDraft, ...a: Answer[]) => applyAnswers(d, a).draft;
const NOW = new Date(2026, 9, 12, 10, 0); // 12 Oct 2026, 10:00 local

describe("start date and time are two halves of one value", () => {
  it("a day alone leaves the start incomplete, then the time completes it", () => {
    const day = apply(base(), ui("ride.start", "startDate", "2026-10-17"));
    expect(day.startDate).toBe("2026-10-17");
    expect(day.startsAt).toBe("");
    const full = apply(day, ui("ride.start", "startTime", "07:30"));
    expect(full.startsAt).toBe("2026-10-17T07:30");
  });

  it("the time can come first", () => {
    const t = apply(base(), ui("ride.start", "startTime", "06:00"));
    expect(t.startsAt).toBe("");
    expect(apply(t, ui("ride.start", "startDate", "2026-10-16")).startsAt).toBe("2026-10-16T06:00");
  });

  it("changing the day keeps the time, and vice versa", () => {
    let d = apply(base(), ui("ride.start", "startsAt", "2026-10-17T07:00"));
    d = apply(d, ui("ride.start", "startDate", "2026-10-18"));
    expect(d.startsAt).toBe("2026-10-18T07:00");
    d = apply(d, ui("ride.start", "startTime", "08:00"));
    expect(d.startsAt).toBe("2026-10-18T08:00");
  });

  it("the whole value splits into its halves (and the original answer still works)", () => {
    const d = apply(base(), ui("ride.start", "startsAt", "2027-03-02T07:00"));
    expect([d.startDate, d.startTime, d.startsAt]).toEqual([
      "2027-03-02",
      "07:00",
      "2027-03-02T07:00",
    ]);
  });

  it("refuses an impossible day or time", () => {
    const r = applyAnswers(base(), [
      ui("ride.start", "startDate", "2026-11-31"),
      ui("ride.start", "startTime", "25:00"),
      ui("ride.start", "startsAt", "2026-10-17T07:99"),
    ]);
    expect(r.rejected.map((x) => x.error)).toEqual([
      "err.startRequired",
      "err.timeRequired",
      "err.startRequired",
    ]);
    expect(r.draft.startsAt).toBe("");
  });

  it("validates: day without time, then past, then fine", () => {
    const q = QUESTIONS.find((x) => x.id === "ride.start");
    if (!q) throw new Error("no start question");
    expect(q.problem(base(), NOW)).toBe("err.startRequired");
    const day = apply(base(), ui("ride.start", "startDate", "2026-10-17"));
    expect(q.problem(day, NOW)).toBe("err.timeRequired");
    const past = apply(
      day,
      ui("ride.start", "startTime", "07:00"),
      ui("ride.start", "startDate", "2026-10-01"),
    );
    expect(q.problem(past, NOW)).toBe("err.startPast");
    const ok = apply(past, ui("ride.start", "startDate", "2026-10-17"));
    expect(q.problem(ok, NOW)).toBeNull();
  });

  it("does not move a past date into next year", () => {
    const d = apply(base(), ui("ride.start", "startsAt", "2026-03-01T07:00"));
    expect(d.startsAt).toBe("2026-03-01T07:00"); // still the year it was given, flagged by problem()
  });

  it("a draft saved before the halves existed restores them from its start", () => {
    const old = { ...base(), startsAt: "2027-06-12T07:30" } as Record<string, unknown>;
    old.startDate = undefined;
    old.startTime = undefined;
    const restored = parseStoredDraft(JSON.parse(JSON.stringify(old)));
    expect(restored?.startDate).toBe("2027-06-12");
    expect(restored?.startTime).toBe("07:30");
    expect(restored?.startsAt).toBe("2027-06-12T07:30");
  });

  it("a half-chosen start survives a save and restore", () => {
    const d = apply(base(), ui("ride.start", "startDate", "2026-10-17"));
    const restored = parseStoredDraft(JSON.parse(JSON.stringify(d)));
    expect(restored).toEqual(d);
  });
});

describe("ride types", () => {
  it("a draft stored with the removed Running type comes back with no type", () => {
    const stored = { ...base(), activityType: "running" };
    expect(parseStoredDraft(JSON.parse(JSON.stringify(stored)))?.activityType).toBeNull();
  });

  it("keeps the stored values road, gravel and mtb", () => {
    for (const type of ["road", "gravel", "mtb"]) {
      const d = apply(base(), ui("ride.type", "activityType", type));
      expect(d.activityType).toBe(type);
      expect(parseStoredDraft(JSON.parse(JSON.stringify(d)))?.activityType).toBe(type);
    }
    expect(
      applyAnswers(base(), [ui("ride.type", "activityType", "running")]).rejected,
    ).toHaveLength(1);
  });
});

describe("progress segments", () => {
  const full = (): RideDraft => {
    let d = base();
    d = apply(d, ui("ride.type", "activityType", "road"));
    d = apply(d, ui("ride.name", "name", "Loop"));
    d = markAnswered(d, "ride.where");
    d = apply(
      d,
      ui("route.choice", "route", {
        kind: "gpx",
        name: "t.gpx",
        sourceEventId: null,
        route: {
          points: [
            [1, 1],
            [2, 2],
          ],
          distanceKm: 3,
        },
      }),
    );
    d = apply(d, ui("ride.start", "startsAt", "2027-03-02T07:00"));
    d = apply(d, ui("ride.visibility", "visibility", "public"));
    return d;
  };

  it("has one segment per real question (review excluded), not a fixed number", () => {
    const segs = progressSegments(base(), NOW);
    expect(segs.map((s) => s.questionId)).toEqual([
      "ride.type",
      "ride.name",
      "ride.where",
      "route.choice",
      "ride.start",
      "ride.visibility",
      "ride.details",
    ]);
    expect(segs.every((s) => !s.done)).toBe(true);
  });

  it("a value the studio pre-filled (the country) does not fill its segment until it is answered", () => {
    const d = base();
    expect(d.country).toBe("IL");
    expect(progressSegments(d, NOW).find((s) => s.questionId === "ride.where")?.done).toBe(false);
    expect(
      progressSegments(markAnswered(d, "ride.where"), NOW).find(
        (s) => s.questionId === "ride.where",
      )?.done,
    ).toBe(true);
  });

  it("fills as each valid answer lands, and the optional question only once handled", () => {
    const d = full();
    const s = progressSummary(progressSegments(d, NOW));
    expect(s).toEqual({ done: 6, total: 7, complete: false });
    const handled = markAnswered(d, "ride.details");
    expect(progressSummary(progressSegments(handled, NOW))).toEqual({
      done: 7,
      total: 7,
      complete: true,
    });
  });

  it("an answer that becomes invalid empties its segment again", () => {
    const d = full();
    const broken = { ...d, name: "   " };
    expect(progressSegments(broken, NOW).find((s) => s.questionId === "ride.name")?.done).toBe(
      false,
    );
    const past = apply(d, ui("ride.start", "startsAt", "2026-01-01T07:00"));
    expect(progressSegments(past, NOW).find((s) => s.questionId === "ride.start")?.done).toBe(
      false,
    );
  });

  it("is the same for a draft restored from storage", () => {
    const d = markAnswered(full(), "ride.details");
    const restored = parseStoredDraft(JSON.parse(JSON.stringify(d))) as RideDraft;
    expect(progressSegments(restored, NOW)).toEqual(progressSegments(d, NOW));
  });

  it("an answered-but-half-done start does not count", () => {
    const d = apply(base(), ui("ride.start", "startDate", "2026-10-17"));
    expect(progressSegments(d, NOW).find((s) => s.questionId === "ride.start")?.done).toBe(false);
  });

  it("picks an encouraging message tier from how far along it is", () => {
    expect(messageTier(0, 7)).toBe(0);
    expect(messageTier(1, 7)).toBe(1);
    expect(messageTier(3, 7)).toBe(2);
    expect(messageTier(5, 7)).toBe(3);
    expect(messageTier(6, 7)).toBe(4);
  });
});
