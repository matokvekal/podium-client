/**
 * The contract for future text, voice and AI input. NOTHING implements it yet and no provider,
 * speech service or network call is wired in: today's studio is buttons and fields only.
 *
 * An interpreter turns free input ("a public 70 km road ride near Jerusalem on Saturday at
 * 06:30") into structured `Answer`s. It never writes to the draft itself and it never talks to
 * the ride API. Its output goes through `submitInterpreted`, which is the same `applyAnswers`
 * every button uses, so:
 *
 *   - every value is re-validated by the question's own rules (an interpreter cannot set a ride
 *     type the picker does not offer, or a visibility that is not public/private);
 *   - whatever is still missing is reported, so the studio asks only for that;
 *   - creating the ride still needs the organizer's explicit confirmation on the review screen,
 *     and the server still authenticates, authorises and validates the request. A model's
 *     confidence is never a reason to skip any of it.
 */

import { applyAnswers, missingRequired } from "./flow";
import type {
  Answer,
  AnswerSource,
  QuestionDef,
  RejectedAnswer,
  RideDraft,
  StudioLocale,
} from "./types";

export interface InterpreterInput {
  /** What the organizer typed or said (a transcript, for voice). */
  text: string;
  source: Exclude<AnswerSource, "ui">;
  locale: StudioLocale;
  /** The draft as it stands, so an interpreter can resolve "make it public" or "the same place". */
  draft: Readonly<RideDraft>;
}

export interface AnswerInterpreter {
  /** Zero or more structured answers. Unrecognised input is an empty array, never an error. */
  interpret(input: InterpreterInput): Promise<Answer[]>;
}

export interface InterpretedResult {
  draft: RideDraft;
  /** Answers the engine refused, with the reason, so the studio can say what it did not take. */
  rejected: RejectedAnswer[];
  /** Required questions still open after this batch — what to ask next. */
  missing: QuestionDef[];
}

/** The one door future input goes through. */
export function submitInterpreted(
  draft: RideDraft,
  answers: readonly Answer[],
  now?: Date,
): InterpretedResult {
  const result = applyAnswers(draft, answers, now?.getTime());
  return {
    draft: result.draft,
    rejected: result.rejected,
    missing: missingRequired(result.draft, now),
  };
}

/** The interpreter used today: understands nothing, so free input is simply not offered. */
export const noInterpreter: AnswerInterpreter = {
  async interpret() {
    return [];
  },
};
