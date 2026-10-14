/**
 * Creates the ride, once, through the existing API.
 *
 * Nothing is sent until the organizer confirms on the review screen; this is the only function
 * in Ride Studio that mutates anything on the server. It reuses, unchanged:
 *   - POST /events and POST /events/:id/route (same body shapes the original form sends);
 *   - the original form's own validation (validation/forms.ts);
 *   - the server's authentication, `create_events` permission, weekly limit and schema checks.
 *
 * DUPLICATE PREVENTION, two layers:
 *   1. in the page: one request per draft at a time (`inFlight`), so a double tap or a
 *      re-render cannot fire two;
 *   2. on the wire: the draft's `submissionId` is the X-Client-Action-Id. The server records it
 *      (middleware/clientActions.ts) and answers a replay with the original result instead of
 *      creating a second ride — which also makes "the connection dropped, did it go through?"
 *      safe to simply retry.
 */

import { ApiError, apiMutate, apiRequest } from "../../lib/api-client";
import type { EventSummary } from "../../lib/local-db";
import { validateCreateEventForm } from "../../validation/forms";
import { missingRequired } from "../engine/flow";
import type { RideDraft } from "../engine/types";
import { buildCreateBody, buildRouteBody, IncompleteDraftError } from "./payload";

export interface CreatedRide {
  event: EventSummary;
  /** True when the server had already created this exact submission (a retry). */
  alreadyCreated: boolean;
  /** Set when the ride exists but its track could not be attached; the ride page can add it. */
  routeError: string | null;
}

export class DraftInvalidError extends Error {
  constructor(readonly fields: string[]) {
    super(`The draft is not valid: ${fields.join(", ")}`);
  }
}

const inFlight = new Map<string, Promise<CreatedRide>>();

export function createRide(draft: RideDraft, now: Date = new Date()): Promise<CreatedRide> {
  const running = inFlight.get(draft.submissionId);
  if (running) return running;
  const promise = run(draft, now).finally(() => inFlight.delete(draft.submissionId));
  inFlight.set(draft.submissionId, promise);
  return promise;
}

async function run(draft: RideDraft, now: Date): Promise<CreatedRide> {
  const open = missingRequired(draft, now);
  if (open.length > 0) throw new IncompleteDraftError(open.map((q) => q.id));

  // The original form's own rules, as a second opinion on what the questions already checked.
  const check = validateCreateEventForm({
    name: draft.name,
    startsAt: draft.startsAt,
    hasRoute: draft.route !== null,
    isEditing: false,
    description: draft.description,
    now,
  });
  if (!check.ok) throw new DraftInvalidError(Object.keys(check.errors));

  const body = buildCreateBody(draft);
  const { result, alreadyApplied } = await apiMutate<EventSummary>("/events", {
    method: "POST",
    body,
    clientActionId: draft.submissionId,
  });

  let routeError: string | null = null;
  if (draft.route) {
    try {
      await apiRequest(`/events/${result.id}/route`, {
        method: "POST",
        body: buildRouteBody(draft.route),
      });
    } catch (err) {
      routeError = err instanceof ApiError ? err.message : "The track could not be attached.";
    }
  }
  return { event: result, alreadyCreated: alreadyApplied, routeError };
}
