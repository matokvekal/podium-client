/**
 * The flow engine. Pure functions over a draft: which questions are showing, where Continue and
 * Back go, what is still missing, and how an answer — from any source — becomes draft state.
 *
 * The engine does not know how an answer arrived. A button tap, typed text, a voice transcript
 * and an AI interpreter's output are all `Answer[]`, and `applyAnswers` treats every one the
 * same way: re-validate, then apply or refuse. That is what stops a future interpreter from
 * setting something a button could not.
 */

import { isKnownCountryCode } from "../../lib/countries";
import { DESCRIPTION_MAX_CHARS } from "../../lib/event-limits";
import { isRegionKey } from "../../lib/regions";
import { ANSWERABLE_FIELDS, QUESTIONS, questionById } from "../schema/questions";
import { isStoredRoute } from "./draft";
import {
  type Answer,
  type ErrorKey,
  type QuestionDef,
  type RejectedAnswer,
  type RideDraft,
  STUDIO_RIDE_TYPES,
  type Stage,
} from "./types";

/** "YYYY-MM-DD" that is a real calendar day (no 31 Nov). */
export function isRealDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(y, mo - 1, d);
  return check.getFullYear() === y && check.getMonth() === mo - 1 && check.getDate() === d;
}

/** "HH:mm", 00:00 to 23:59. */
export function isRealTime(value: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  return !!m && Number(m[1]) < 24 && Number(m[2]) < 60;
}

/** One half of the start changed: `startsAt` is the join of both once both are set, "" until. */
function withStart(
  draft: RideDraft,
  part: Partial<Pick<RideDraft, "startDate" | "startTime">>,
): Partial<RideDraft> {
  const startDate = part.startDate ?? draft.startDate;
  const startTime = part.startTime ?? draft.startTime;
  return {
    startDate,
    startTime,
    startsAt: startDate && startTime ? `${startDate}T${startTime}` : "",
  };
}

export const STAGES: readonly Stage[] = ["idea", "details", "review"];

/** The questions the organizer can currently be asked, in order. */
export function visibleQuestions(draft: RideDraft): QuestionDef[] {
  return QUESTIONS.filter((q) => (q.visibleWhen ? q.visibleWhen(draft) : true));
}

export function nextQuestionId(draft: RideDraft, fromId: string): string | null {
  const list = visibleQuestions(draft);
  const i = list.findIndex((q) => q.id === fromId);
  return i >= 0 && i < list.length - 1 ? list[i + 1].id : null;
}

export function previousQuestionId(draft: RideDraft, fromId: string): string | null {
  const list = visibleQuestions(draft);
  const i = list.findIndex((q) => q.id === fromId);
  return i > 0 ? list[i - 1].id : null;
}

/** Visible, required questions that do not yet hold a valid answer. What Review lists. */
export function missingRequired(draft: RideDraft, now?: Date): QuestionDef[] {
  return visibleQuestions(draft).filter((q) => q.required && !q.isComplete(draft, now));
}

/** Where Resume should land: the first required question still open, else the review. */
export function firstOpenQuestionId(draft: RideDraft, now?: Date): string {
  return missingRequired(draft, now)[0]?.id ?? "ride.review";
}

export function canCreate(draft: RideDraft, now?: Date): boolean {
  return missingRequired(draft, now).length === 0;
}

export interface StageProgress {
  stage: Stage;
  /** Required questions in this stage that are complete / that exist. */
  done: number;
  total: number;
  active: boolean;
}

export function stageProgress(draft: RideDraft, now?: Date): StageProgress[] {
  const current = questionById(draft.currentQuestionId)?.stage ?? "idea";
  return STAGES.map((stage) => {
    const required = visibleQuestions(draft).filter((q) => q.stage === stage && q.required);
    return {
      stage,
      done: required.filter((q) => q.isComplete(draft, now)).length,
      total: required.length,
      active: stage === current,
    };
  });
}

// ── Answers ─────────────────────────────────────────────────────────────────────────────────

function checkAndSet(
  draft: RideDraft,
  answer: Answer,
): { draft: RideDraft; error: null } | { draft: RideDraft; error: ErrorKey } {
  const { field, value } = answer;
  const fail = (error: ErrorKey) => ({ draft, error });
  const ok = (patch: Partial<RideDraft>) => ({ draft: { ...draft, ...patch }, error: null });

  switch (field) {
    case "activityType":
      if (value === null) return ok({ activityType: null });
      return (STUDIO_RIDE_TYPES as readonly unknown[]).includes(value)
        ? ok({ activityType: value as RideDraft["activityType"] })
        : fail("err.type");

    case "name":
      return typeof value === "string" && value.length <= 600
        ? ok({ name: value })
        : fail("err.nameLong");

    case "country": {
      if (value === null) return ok({ country: null, region: null });
      if (!isKnownCountryCode(value)) return fail("err.country");
      // A region key only means something in Israel; leaving it behind would send a nonsense
      // pair to the server.
      return ok({ country: value, region: value === "IL" ? draft.region : null });
    }

    case "region":
      if (value === null) return ok({ region: null });
      return draft.country === "IL" && isRegionKey(value)
        ? ok({ region: value })
        : fail("err.region");

    case "place":
      return typeof value === "string" && value.length <= 600
        ? ok({ place: value })
        : fail("err.place");

    case "route":
      if (value === null) return ok({ route: null });
      return isStoredRoute(value) ? ok({ route: value }) : fail("err.route");

    case "startsAt": {
      // The whole value at once (an interpreter, or a restored answer): split it into halves.
      if (typeof value !== "string") return fail("err.startRequired");
      if (value === "") return ok({ startsAt: "", startDate: "", startTime: "" });
      const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value);
      if (!m || !isRealDate(m[1]) || !isRealTime(m[2])) return fail("err.startRequired");
      return ok({ startsAt: value, startDate: m[1], startTime: m[2] });
    }

    case "startDate":
      if (typeof value !== "string" || (value !== "" && !isRealDate(value))) {
        return fail("err.startRequired");
      }
      return ok(withStart(draft, { startDate: value }));

    case "startTime":
      if (typeof value !== "string" || (value !== "" && !isRealTime(value))) {
        return fail("err.timeRequired");
      }
      return ok(withStart(draft, { startTime: value }));

    case "visibility":
      if (value === null) return ok({ visibility: null });
      return value === "public" || value === "private"
        ? ok({ visibility: value })
        : fail("err.visibility");

    case "description":
      return typeof value === "string" && value.length <= DESCRIPTION_MAX_CHARS * 4
        ? ok({ description: value })
        : fail("err.descriptionLong");

    case "requiresApproval":
      return typeof value === "boolean" ? ok({ requiresApproval: value }) : fail("err.flag");

    case "joinAsRider":
      return typeof value === "boolean" ? ok({ joinAsRider: value }) : fail("err.flag");

    case "coverKey":
      if (value === null) return ok({ coverKey: null, coverTouched: true });
      return typeof value === "string" && value.length > 0 && value.length <= 64
        ? ok({ coverKey: value, coverTouched: true })
        : fail("err.cover");

    default:
      return fail("err.unknownField");
  }
}

/**
 * Applies a batch of answers in order. Each is validated on its own: the accepted ones land,
 * the refused ones come back in `rejected` with a reason, and nothing about one affects whether
 * another is tried. A batch can therefore carry several answers at once — which is how a future
 * interpreter will fill in a whole sentence — and the caller then asks `missingRequired`
 * what is left.
 */
export function applyAnswers(
  draft: RideDraft,
  answers: readonly Answer[],
  now: number = Date.now(),
): { draft: RideDraft; rejected: RejectedAnswer[] } {
  let next = draft;
  const rejected: RejectedAnswer[] = [];
  const answered = new Set(draft.answered);

  for (const answer of answers) {
    if (!ANSWERABLE_FIELDS.has(answer.field)) {
      rejected.push({ answer, error: "err.unknownField" });
      continue;
    }
    const result = checkAndSet(next, answer);
    if (result.error) {
      rejected.push({ answer, error: result.error });
      continue;
    }
    next = result.draft;
    if (questionById(answer.questionId)) answered.add(answer.questionId);
  }

  // Nothing was accepted: hand back the very same draft so callers can skip a save.
  if (next === draft) return { draft, rejected };
  return { draft: { ...next, answered: [...answered], updatedAt: now }, rejected };
}

/** Marks a question as handled without changing any value — Continue on an optional question
 *  the organizer chose to leave alone. */
export function markAnswered(
  draft: RideDraft,
  questionId: string,
  now: number = Date.now(),
): RideDraft {
  if (draft.answered.includes(questionId)) return draft;
  return { ...draft, answered: [...draft.answered, questionId], updatedAt: now };
}

export function goTo(draft: RideDraft, questionId: string, now: number = Date.now()): RideDraft {
  if (!questionById(questionId) || draft.currentQuestionId === questionId) return draft;
  return { ...draft, currentQuestionId: questionId, updatedAt: now };
}

export function setLocale(
  draft: RideDraft,
  locale: RideDraft["locale"],
  now: number = Date.now(),
): RideDraft {
  return draft.locale === locale ? draft : { ...draft, locale, updatedAt: now };
}

/**
 * Offers a cover the organizer has not chosen. A cover they picked (or removed) themselves is
 * never replaced by a suggestion, whatever else changes afterwards — the contract that stops
 * "I changed the region and my photo vanished".
 */
export function suggestCover(
  draft: RideDraft,
  key: string | null,
  now: number = Date.now(),
): RideDraft {
  if (draft.coverTouched || draft.coverKey === key) return draft;
  return { ...draft, coverKey: key, updatedAt: now };
}
