/**
 * The question registry: every question Ride Studio can ask, as data.
 *
 * Adding a question is adding an entry here and its words to i18n/. The renderer, the flow
 * engine, the draft and the review screen pick it up from this list — none has a switch on a
 * question id. Questions are grouped where the fields belong together (where the ride is, a few
 * optional details) so the studio stays a short conversation, not one screen per column.
 *
 * Validation here mirrors the original create form's rules (validation/forms.ts) and the
 * server's schema on purpose and imports the same constants; the server stays the authority.
 */

import { isKnownCountryCode } from "../../lib/countries";
import { DESCRIPTION_MAX_CHARS } from "../../lib/event-limits";
import { isRegionKey } from "../../lib/regions";
import { isPastDatetimeLocal } from "../../lib/ride-date";
import type { ErrorKey, QuestionDef, RideDraft } from "../engine/types";

const NAME_MAX = 255;
const PLACE_MAX = 255;
export const START_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function complete(def: Omit<QuestionDef, "isComplete">): QuestionDef {
  return { ...def, isComplete: (draft, now) => def.problem(draft, now) === null };
}

export const QUESTIONS: readonly QuestionDef[] = [
  // ── Stage A — the idea ──────────────────────────────────────────────────────────────────
  complete({
    id: "ride.type",
    stage: "idea",
    kind: "choice",
    fields: ["activityType"],
    required: true,
    titleKey: "q.type.title",
    hintKey: "q.type.hint",
    problem: (d): ErrorKey | null => (d.activityType ? null : "err.type"),
  }),
  complete({
    id: "ride.name",
    stage: "idea",
    kind: "text",
    fields: ["name"],
    required: true,
    titleKey: "q.name.title",
    hintKey: "q.name.hint",
    problem: (d): ErrorKey | null => {
      const name = d.name.trim();
      if (!name) return "err.name";
      return name.length > NAME_MAX ? "err.nameLong" : null;
    },
  }),
  complete({
    id: "ride.where",
    stage: "idea",
    kind: "place",
    fields: ["country", "region", "place"],
    required: true,
    titleKey: "q.where.title",
    hintKey: "q.where.hint",
    problem: (d): ErrorKey | null => {
      if (!isKnownCountryCode(d.country)) return "err.country";
      if (d.region !== null && (d.country !== "IL" || !isRegionKey(d.region))) return "err.region";
      return d.place.length > PLACE_MAX ? "err.place" : null;
    },
  }),

  // ── Stage B — route and details ─────────────────────────────────────────────────────────
  complete({
    id: "route.choice",
    stage: "details",
    kind: "route",
    fields: ["route"],
    required: true,
    titleKey: "q.route.title",
    hintKey: "q.route.hint",
    problem: (d): ErrorKey | null => (d.route ? null : "err.route"),
  }),
  complete({
    id: "ride.start",
    stage: "details",
    kind: "datetime",
    fields: ["startsAt"],
    required: true,
    titleKey: "q.start.title",
    hintKey: "q.start.hint",
    problem: (d, now): ErrorKey | null => {
      if (!START_PATTERN.test(d.startsAt)) return "err.startRequired";
      return isPastDatetimeLocal(d.startsAt, now) ? "err.startPast" : null;
    },
  }),
  complete({
    id: "ride.visibility",
    stage: "details",
    kind: "choice",
    fields: ["visibility"],
    required: true,
    titleKey: "q.visibility.title",
    hintKey: "q.visibility.hint",
    problem: (d): ErrorKey | null => (d.visibility ? null : "err.visibility"),
  }),
  complete({
    id: "ride.details",
    stage: "details",
    kind: "toggles",
    fields: ["description", "requiresApproval", "joinAsRider"],
    required: false,
    titleKey: "q.details.title",
    hintKey: "q.details.hint",
    problem: (d): ErrorKey | null =>
      d.description.trim().length > DESCRIPTION_MAX_CHARS ? "err.descriptionLong" : null,
  }),

  // ── Stage C — review ────────────────────────────────────────────────────────────────────
  complete({
    id: "ride.review",
    stage: "review",
    kind: "review",
    fields: [],
    required: false,
    titleKey: "q.review.title",
    hintKey: "q.review.hint",
    problem: () => null,
  }),
];

/** Every draft field a question can write — what an answer's `field` must be one of. */
export const ANSWERABLE_FIELDS: ReadonlySet<string> = new Set(
  QUESTIONS.flatMap((q) => q.fields).concat("coverKey"),
);

export function questionById(id: string): QuestionDef | undefined {
  return QUESTIONS.find((q) => q.id === id);
}

/** Used by tests and by the review screen to name which question owns a field. */
export function questionForField(field: string): QuestionDef | undefined {
  return QUESTIONS.find((q) => (q.fields as readonly string[]).includes(field));
}

export type { RideDraft };
