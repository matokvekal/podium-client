/**
 * Ride Studio — the shared vocabulary. Nothing in here touches React, the network or storage, so
 * the engine, the schema and the adapters can all be tested without a browser.
 *
 * Two ideas carry the design:
 *
 *  - The draft is the ONLY state. Every screen reads it; every input — a button tap today, typed
 *    text, voice or an AI interpreter tomorrow — changes it the same way, by submitting
 *    `Answer`s. The flow engine never learns where an answer came from.
 *  - Answers are untrusted. `applyAnswers` re-validates every value against the question's own
 *    rules, so a future interpreter cannot smuggle a value past what a button could have set.
 *    The server still validates and authorises everything again on create.
 */

import type { EventRoute } from "../../lib/event-route";
import type { SurfaceType } from "../../lib/surface-types";

/** Where an answer came from. The engine ignores it; it is recorded for tests and analytics
 *  decisions later (no tracking is added by this module). */
export type AnswerSource = "ui" | "text" | "voice" | "ai";

/** The ride types Ride Studio offers: the same set the original form's Terrain picker shows
 *  today (Hiking is hidden there, so it is hidden here). */
export const STUDIO_RIDE_TYPES = [
  "road",
  "mtb",
  "gravel",
  "running",
] as const satisfies readonly SurfaceType[];
export type StudioRideType = (typeof STUDIO_RIDE_TYPES)[number];

export type Visibility = "public" | "private";

/** The track a ride is built on. The original form requires one on create, so "no route" is not
 *  a state a draft can be submitted in; it exists only while the question is unanswered. */
export interface DraftRoute {
  /** "library": copied from another ride's track in Browse tracks. "gpx": the organizer's own
   *  uploaded file. Both end up as geometry, which is exactly what the original form sends. */
  kind: "library" | "gpx";
  /** The track's name, or the uploaded file's name. */
  name: string;
  route: EventRoute;
  /** The ride the track was copied from (library only), else null. */
  sourceEventId: string | null;
}

/** Everything the organizer has decided so far. Plain JSON, so it survives localStorage. */
export interface RideDraft {
  schemaVersion: 1;
  /** One UUID per draft, sent as X-Client-Action-Id on create. A retry, a double tap or a
   *  replay after a lost connection is then the SAME action to the server, which answers it
   *  once. Regenerated only when a ride was actually created. */
  submissionId: string;
  /** Question the organizer was last on — where Resume lands. */
  currentQuestionId: string;
  /** Question ids the organizer has answered or deliberately skipped. */
  answered: string[];

  activityType: StudioRideType | null;
  name: string;
  /** ISO 3166-1 alpha-2. */
  country: string | null;
  /** Coarse region key; Israel only (lib/regions.ts), null elsewhere. */
  region: string | null;
  /** Free-text place, e.g. the meeting point or start village. Optional. */
  place: string;
  route: DraftRoute | null;
  /** "YYYY-MM-DDTHH:mm", the organizer's wall-clock time (same shape as the original form). */
  startsAt: string;
  visibility: Visibility | null;
  description: string;
  requiresApproval: boolean;
  /** "I'm riding too" — the organizer joins the start list. */
  joinAsRider: boolean;

  /** The cover picked for the ride: a server registry key, or null for none. */
  coverKey: string | null;
  /** True once the organizer chose (or removed) a cover themselves. A suggestion never replaces
   *  a cover the organizer touched, whatever else changes afterwards. */
  coverTouched: boolean;

  /** The language the studio is shown in. Switching it never touches any answer. */
  locale: StudioLocale;
  updatedAt: number;
}

export type StudioLocale = "en" | "he";

/** The draft fields an answer may target. A union of literals, so a typo is a compile error. */
export type DraftField =
  | "activityType"
  | "name"
  | "country"
  | "region"
  | "place"
  | "route"
  | "startsAt"
  | "visibility"
  | "description"
  | "requiresApproval"
  | "joinAsRider"
  | "coverKey";

/** One normalised answer: `{ questionId, field, value, source }`. */
export interface Answer {
  questionId: string;
  field: DraftField;
  value: unknown;
  source: AnswerSource;
}

/** Why an answer was refused. A key into the studio dictionary, never prose, so the message
 *  follows the language the organizer is using. */
export type ErrorKey =
  | "err.type"
  | "err.name"
  | "err.nameLong"
  | "err.country"
  | "err.region"
  | "err.place"
  | "err.route"
  | "err.startRequired"
  | "err.startPast"
  | "err.visibility"
  | "err.descriptionLong"
  | "err.flag"
  | "err.cover"
  | "err.unknownField";

export interface RejectedAnswer {
  answer: Answer;
  error: ErrorKey;
}

export type Stage = "idea" | "details" | "review";

export type QuestionKind =
  | "choice"
  | "text"
  | "place"
  | "route"
  | "datetime"
  | "textarea"
  | "toggles"
  | "review";

/** A question, as data. The screen renders it; the engine reasons about it; neither knows the
 *  other's business. `required` means the ride cannot be created without it. */
export interface QuestionDef {
  id: string;
  stage: Stage;
  kind: QuestionKind;
  /** Draft fields this question writes (several for a grouped question). */
  fields: readonly DraftField[];
  required: boolean;
  /** Dictionary keys. */
  titleKey: string;
  hintKey?: string;
  /** Hidden questions are skipped by Continue and ignored by the missing-answers check. */
  visibleWhen?: (draft: RideDraft) => boolean;
  /** True when the draft already holds a valid value for this question. */
  isComplete: (draft: RideDraft, now?: Date) => boolean;
  /** Why the current value is unacceptable, or null. Drives the inline error. */
  problem: (draft: RideDraft, now?: Date) => ErrorKey | null;
}
