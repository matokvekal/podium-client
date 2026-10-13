/**
 * The ride draft: its starting shape, its (de)serialisation and the language default.
 * Pure — storage lives in draft-storage.ts, so this stays testable without a browser.
 */

import { newClientActionId } from "../../lib/api-client";
import { deviceLocales } from "../../lib/app-tagline";
import type { RideDraft, StudioLocale } from "./types";

export const FIRST_QUESTION_ID = "ride.type";

/** The studio speaks English and Hebrew. Any other device language falls back to English —
 *  the same "country first, then device language, then English" spirit as the app's tagline,
 *  narrowed to the two languages the studio actually has words for. */
export function defaultStudioLocale(
  country: string | null | undefined,
  locales: readonly string[] = deviceLocales(),
): StudioLocale {
  if (country?.toUpperCase() === "IL") return "he";
  for (const locale of locales) {
    const primary = locale.split("-")[0]?.toLowerCase();
    if (primary === "he" || primary === "iw") return "he";
    if (primary === "en") return "en";
  }
  return "en";
}

export function createDraft(options: {
  locale: StudioLocale;
  country?: string | null;
  now?: number;
  submissionId?: string;
}): RideDraft {
  return {
    schemaVersion: 1,
    submissionId: options.submissionId ?? newClientActionId(),
    currentQuestionId: FIRST_QUESTION_ID,
    answered: [],
    activityType: null,
    name: "",
    country: options.country ?? null,
    region: null,
    place: "",
    route: null,
    startsAt: "",
    visibility: null,
    description: "",
    requiresApproval: false,
    joinAsRider: true,
    coverKey: null,
    coverTouched: false,
    locale: options.locale,
    updatedAt: options.now ?? Date.now(),
  };
}

/** True when the organizer has put anything in: an untouched draft is not worth saving or
 *  offering to resume. */
export function draftHasContent(draft: RideDraft): boolean {
  return (
    draft.answered.length > 0 ||
    draft.activityType !== null ||
    draft.name.trim() !== "" ||
    draft.route !== null ||
    draft.startsAt !== "" ||
    draft.visibility !== null ||
    draft.description.trim() !== ""
  );
}

/**
 * Reads a stored draft back. Anything that is not a version-1 draft of the right shape is
 * rejected (null) rather than half-trusted: a corrupt or future-version blob must never put the
 * studio in a state the engine does not understand. Unknown extra keys are dropped.
 */
export function parseStoredDraft(raw: unknown): RideDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Partial<RideDraft> & Record<string, unknown>;
  if (d.schemaVersion !== 1) return null;
  if (typeof d.submissionId !== "string" || d.submissionId.length < 8) return null;
  if (typeof d.currentQuestionId !== "string") return null;
  if (!Array.isArray(d.answered) || !d.answered.every((x) => typeof x === "string")) return null;
  if (d.locale !== "en" && d.locale !== "he") return null;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const strOrNull = (v: unknown) => (typeof v === "string" ? v : null);
  const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
  const type = d.activityType;
  return {
    schemaVersion: 1,
    submissionId: d.submissionId,
    currentQuestionId: d.currentQuestionId,
    answered: d.answered as string[],
    activityType:
      type === "road" || type === "mtb" || type === "gravel" || type === "running" ? type : null,
    name: str(d.name),
    country: strOrNull(d.country),
    region: strOrNull(d.region),
    place: str(d.place),
    route: isStoredRoute(d.route) ? d.route : null,
    startsAt: str(d.startsAt),
    visibility: d.visibility === "public" || d.visibility === "private" ? d.visibility : null,
    description: str(d.description),
    requiresApproval: bool(d.requiresApproval, false),
    joinAsRider: bool(d.joinAsRider, true),
    coverKey: strOrNull(d.coverKey),
    coverTouched: bool(d.coverTouched, false),
    locale: d.locale,
    updatedAt: typeof d.updatedAt === "number" ? d.updatedAt : Date.now(),
  };
}

export function isStoredRoute(value: unknown): value is NonNullable<RideDraft["route"]> {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  if (r.kind !== "library" && r.kind !== "gpx") return false;
  if (typeof r.name !== "string") return false;
  if (r.sourceEventId !== null && typeof r.sourceEventId !== "string") return false;
  const route = r.route as { points?: unknown; distanceKm?: unknown } | undefined;
  return (
    Array.isArray(route?.points) &&
    route.points.length >= 2 &&
    route.points.every(
      (p) =>
        Array.isArray(p) && p.length === 2 && typeof p[0] === "number" && typeof p[1] === "number",
    ) &&
    typeof route.distanceKm === "number"
  );
}
