import { describe, expect, it } from "vitest";
import { createDraft } from "./draft";
import {
  applyAnswers,
  canCreate,
  firstOpenQuestionId,
  goTo,
  markAnswered,
  missingRequired,
  nextQuestionId,
  previousQuestionId,
  setLocale,
  stageProgress,
  suggestCover,
  visibleQuestions,
} from "./flow";
import { submitInterpreted } from "./interpreter";
import type { Answer, RideDraft } from "./types";

const NOW = new Date(2026, 9, 13, 10, 0);
const LATER = "2026-10-20T06:30";
const TRACK = {
  kind: "library",
  name: "Hills",
  sourceEventId: "e1",
  route: {
    points: [
      [32.1, 34.8],
      [32.2, 34.9],
    ],
    distanceKm: 40,
    elevationM: 500,
  },
};

function blank(): RideDraft {
  return createDraft({
    locale: "en",
    country: "IL",
    submissionId: "11111111-1111-4111-8111-111111111111",
    now: 1,
  });
}

const ui = (questionId: string, field: Answer["field"], value: unknown): Answer => ({
  questionId,
  field,
  value,
  source: "ui",
});

function complete(): RideDraft {
  const { draft } = applyAnswers(blank(), [
    ui("ride.type", "activityType", "road"),
    ui("ride.name", "name", "Saturday loop"),
    ui("ride.where", "country", "IL"),
    ui("route.choice", "route", TRACK),
    ui("ride.start", "startsAt", LATER),
    ui("ride.visibility", "visibility", "public"),
  ]);
  return draft;
}

describe("question order", () => {
  it("runs Idea → Route & details → Review, in a fixed order", () => {
    const ids = visibleQuestions(blank()).map((q) => q.id);
    expect(ids).toEqual([
      "ride.type",
      "ride.name",
      "ride.where",
      "route.choice",
      "ride.start",
      "ride.visibility",
      "ride.details",
      "ride.review",
    ]);
  });

  it("moves forward and back, and stops at the ends", () => {
    const d = blank();
    expect(nextQuestionId(d, "ride.type")).toBe("ride.name");
    expect(nextQuestionId(d, "ride.review")).toBeNull();
    expect(previousQuestionId(d, "ride.name")).toBe("ride.type");
    expect(previousQuestionId(d, "ride.type")).toBeNull();
    expect(nextQuestionId(d, "nope")).toBeNull();
  });

  it("goTo ignores an unknown question", () => {
    const d = blank();
    expect(goTo(d, "ride.start").currentQuestionId).toBe("ride.start");
    expect(goTo(d, "bogus")).toBe(d);
  });
});

describe("what is missing", () => {
  it("lists every required question on an empty draft except the country that was pre-set", () => {
    // country is pre-set to IL, so "where" is already complete.
    expect(missingRequired(blank(), NOW).map((q) => q.id)).toEqual([
      "ride.type",
      "ride.name",
      "route.choice",
      "ride.start",
      "ride.visibility",
    ]);
  });

  it("is empty — and the ride can be created — once everything required is answered", () => {
    expect(missingRequired(complete(), NOW)).toEqual([]);
    expect(canCreate(complete(), NOW)).toBe(true);
  });

  it("the optional details question never blocks creation", () => {
    const d = complete();
    expect(d.answered).not.toContain("ride.details");
    expect(canCreate(d, NOW)).toBe(true);
  });

  it("a start time in the past is not complete", () => {
    const { draft } = applyAnswers(complete(), [ui("ride.start", "startsAt", "2026-10-01T06:30")]);
    expect(missingRequired(draft, NOW).map((q) => q.id)).toEqual(["ride.start"]);
  });

  it("resume lands on the first open question, or the review when nothing is open", () => {
    expect(firstOpenQuestionId(blank(), NOW)).toBe("ride.type");
    expect(firstOpenQuestionId(complete(), NOW)).toBe("ride.review");
  });

  it("reports per-stage progress", () => {
    const progress = stageProgress(complete(), NOW);
    expect(progress.map((p) => [p.stage, p.done, p.total])).toEqual([
      ["idea", 3, 3],
      ["details", 3, 3],
      ["review", 0, 0],
    ]);
    expect(progress.find((p) => p.active)?.stage).toBe("idea");
  });
});

describe("applying answers", () => {
  it("records the answer and marks its question answered", () => {
    const { draft, rejected } = applyAnswers(blank(), [ui("ride.type", "activityType", "mtb")], 99);
    expect(rejected).toEqual([]);
    expect(draft.activityType).toBe("mtb");
    expect(draft.answered).toEqual(["ride.type"]);
    expect(draft.updatedAt).toBe(99);
  });

  it("refuses a ride type the picker does not offer", () => {
    const d = blank();
    const result = applyAnswers(d, [ui("ride.type", "activityType", "hiking")]);
    expect(result.rejected.map((r) => r.error)).toEqual(["err.type"]);
    expect(result.draft).toBe(d);
  });

  it("refuses a field it does not know, however it arrived", () => {
    const result = applyAnswers(blank(), [
      { questionId: "ride.name", field: "isAdmin" as never, value: true, source: "ai" },
    ]);
    expect(result.rejected[0].error).toBe("err.unknownField");
  });

  it("refuses wrongly typed values", () => {
    const d = blank();
    const answers = [
      ui("ride.visibility", "visibility", "friends"),
      ui("ride.details", "requiresApproval", "yes"),
      ui("ride.name", "name", 42),
      ui("ride.start", "startsAt", 20261020),
      ui("route.choice", "route", { kind: "library" }),
    ];
    const result = applyAnswers(d, answers);
    expect(result.rejected).toHaveLength(answers.length);
    expect(result.draft).toBe(d);
  });

  it("applies the valid answers in a batch and reports the others", () => {
    const result = applyAnswers(blank(), [
      ui("ride.type", "activityType", "gravel"),
      ui("ride.visibility", "visibility", "secret"),
      ui("ride.name", "name", "Dusty one"),
    ]);
    expect(result.draft.activityType).toBe("gravel");
    expect(result.draft.name).toBe("Dusty one");
    expect(result.draft.visibility).toBeNull();
    expect(result.rejected.map((r) => r.answer.field)).toEqual(["visibility"]);
  });

  it("treats every source identically", () => {
    const outcomes = (["ui", "text", "voice", "ai"] as const).map(
      (source) =>
        applyAnswers(
          blank(),
          [{ questionId: "ride.type", field: "activityType", value: "road", source }],
          5,
        ).draft,
    );
    for (const d of outcomes) expect(d).toEqual(outcomes[0]);
  });

  it("a region only makes sense in Israel, and leaving Israel drops it", () => {
    const inIsrael = applyAnswers(blank(), [ui("ride.where", "region", "negev")]).draft;
    expect(inIsrael.region).toBe("negev");
    const abroad = applyAnswers(inIsrael, [ui("ride.where", "country", "CH")]).draft;
    expect(abroad.country).toBe("CH");
    expect(abroad.region).toBeNull();
    expect(applyAnswers(abroad, [ui("ride.where", "region", "negev")]).rejected[0].error).toBe(
      "err.region",
    );
  });

  it("refuses an unknown country or region", () => {
    expect(applyAnswers(blank(), [ui("ride.where", "country", "ZZ")]).rejected[0].error).toBe(
      "err.country",
    );
    expect(applyAnswers(blank(), [ui("ride.where", "region", "atlantis")]).rejected[0].error).toBe(
      "err.region",
    );
  });

  it("markAnswered records a skipped optional question once", () => {
    const d = markAnswered(blank(), "ride.details", 7);
    expect(d.answered).toEqual(["ride.details"]);
    expect(markAnswered(d, "ride.details", 8)).toBe(d);
  });
});

describe("the interpreter door", () => {
  it("applies several answers at once and says what is still missing", () => {
    const result = submitInterpreted(
      blank(),
      [
        { questionId: "ride.type", field: "activityType", value: "road", source: "ai" },
        { questionId: "ride.visibility", field: "visibility", value: "public", source: "ai" },
        { questionId: "ride.start", field: "startsAt", value: LATER, source: "ai" },
      ],
      NOW,
    );
    expect(result.rejected).toEqual([]);
    expect(result.missing.map((q) => q.id)).toEqual(["ride.name", "route.choice"]);
  });

  it("cannot bypass the rules a button is held to", () => {
    const result = submitInterpreted(
      blank(),
      [
        {
          questionId: "ride.visibility",
          field: "visibility",
          value: "everyone-and-their-dog",
          source: "ai",
        },
      ],
      NOW,
    );
    expect(result.draft.visibility).toBeNull();
    expect(result.rejected).toHaveLength(1);
    expect(result.missing.map((q) => q.id)).toContain("ride.visibility");
  });
});

describe("covers and language", () => {
  it("a suggestion fills an untouched cover", () => {
    expect(suggestCover(blank(), "road-1").coverKey).toBe("road-1");
  });

  it("never replaces a cover the organizer chose, or removed", () => {
    const chosen = applyAnswers(blank(), [ui("ride.cover", "coverKey", "mine")]).draft;
    expect(chosen.coverTouched).toBe(true);
    expect(suggestCover(chosen, "road-1")).toBe(chosen);
    const removed = applyAnswers(chosen, [ui("ride.cover", "coverKey", null)]).draft;
    expect(removed.coverKey).toBeNull();
    expect(suggestCover(removed, "road-1")).toBe(removed);
  });

  it("switching language keeps every answer", () => {
    const d = complete();
    const he = setLocale(d, "he", 10);
    expect(he.locale).toBe("he");
    expect({ ...he, locale: d.locale, updatedAt: d.updatedAt }).toEqual(d);
    expect(setLocale(d, "en")).toBe(d);
  });
});
