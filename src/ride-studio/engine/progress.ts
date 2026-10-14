/**
 * The progress battery's arithmetic. Pure: the draft in, the segments out.
 *
 * One segment per meaningful question the organizer can currently be asked — the review is the
 * destination, not a question — so the count follows the real flow (it is not a hard-coded 8) and
 * changes with it if a question is added or becomes conditional.
 *
 * A segment is filled only when the answer is VALID and the organizer has actually answered or
 * deliberately skipped it. Merely arriving on a question, or a value the studio pre-filled (the
 * country from the profile), does not fill anything. Because it is derived from the draft every
 * time, editing an earlier answer into an invalid one empties its segment again, and a draft
 * restored from this device shows exactly the progress it had.
 */

import { visibleQuestions } from "./flow";
import type { RideDraft } from "./types";

export interface ProgressSegment {
  questionId: string;
  done: boolean;
}

export function progressSegments(draft: RideDraft, now?: Date): ProgressSegment[] {
  return visibleQuestions(draft)
    .filter((q) => q.kind !== "review")
    .map((q) => ({
      questionId: q.id,
      done: draft.answered.includes(q.id) && q.isComplete(draft, now),
    }));
}

export function progressSummary(segments: readonly ProgressSegment[]): {
  done: number;
  total: number;
  complete: boolean;
} {
  const done = segments.filter((s) => s.done).length;
  return {
    done,
    total: segments.length,
    complete: segments.length > 0 && done === segments.length,
  };
}

/** Which of the localized encouragements fits: 0 (nothing yet) to 4 (one step to go). */
export function messageTier(done: number, total: number): 0 | 1 | 2 | 3 | 4 {
  if (total <= 0 || done <= 0) return 0;
  const ratio = done / total;
  if (ratio < 0.34) return 1;
  if (ratio < 0.6) return 2;
  if (ratio < 0.85) return 3;
  return 4;
}
