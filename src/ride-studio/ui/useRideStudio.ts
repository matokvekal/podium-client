/**
 * The studio's only React state: the draft, plus how it is saved.
 *
 * Saving: any change is written to this device (debounced, so typing is not a write per key),
 * and flushed immediately when the page is hidden, closed or the organizer leaves — a refresh
 * or a dropped connection never loses an answer, and Back never needs to save anything because
 * going back changes only which question is showing.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createDraft, defaultStudioLocale, FIRST_QUESTION_ID } from "../engine/draft";
import { loadDraft, saveDraft } from "../engine/draft-storage";
import { applyAnswers, goTo, markAnswered, setLocale, suggestCover } from "../engine/flow";
import type { Answer, RideDraft, StudioLocale } from "../engine/types";

const SAVE_DELAY_MS = 400;

export interface RideStudioState {
  draft: RideDraft;
  /** True when the draft was restored from this device rather than started fresh. */
  restored: boolean;
  saved: boolean;
  /** Apply answers from any source. Returns the refusals so a screen can show why. */
  answer(answers: Answer[]): ReturnType<typeof applyAnswers>["rejected"];
  go(questionId: string): void;
  /** Mark a question handled (optional ones the organizer left alone) and optionally move on. */
  done(questionId: string, nextId?: string | null): void;
  setLanguage(locale: StudioLocale): void;
  offerCover(key: string | null): void;
  /** Throw the draft away and start a clean one. */
  restart(): void;
  /** Write now, without waiting for the debounce. */
  flush(): void;
}

export function useRideStudio(options: {
  userId: number;
  profileCountry: string | null | undefined;
  /** Start from nothing even if a draft is stored (the "start a new one instead" choice). */
  fresh?: boolean;
}): RideStudioState {
  const { userId, profileCountry, fresh } = options;

  // Read once, on mount: a later profile or storage change must not rewind the conversation.
  const [initial] = useState(() => {
    const stored = fresh ? null : loadDraft(userId);
    if (stored) return { draft: stored, restored: true };
    return {
      draft: createDraft({
        locale: defaultStudioLocale(profileCountry),
        country: profileCountry ?? null,
      }),
      restored: false,
    };
  });

  const [draft, setDraft] = useState<RideDraft>(initial.draft);
  const [saved, setSaved] = useState(initial.restored);
  const latest = useRef(draft);
  latest.current = draft;
  const timer = useRef<number | null>(null);

  const flush = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setSaved(saveDraft(userId, latest.current));
  }, [userId]);

  // Debounced autosave on every change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: draft is the trigger
  useEffect(() => {
    setSaved(false);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, SAVE_DELAY_MS);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [draft, flush]);

  // Never lose the last keystrokes: write when the page is hidden or going away, and on unmount.
  useEffect(() => {
    const onHide = () => flush();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [flush]);

  const answer = useCallback((answers: Answer[]) => {
    const result = applyAnswers(latest.current, answers);
    if (result.draft !== latest.current) {
      latest.current = result.draft;
      setDraft(result.draft);
    }
    return result.rejected;
  }, []);

  const update = useCallback((fn: (d: RideDraft) => RideDraft) => {
    const next = fn(latest.current);
    if (next !== latest.current) {
      latest.current = next;
      setDraft(next);
    }
  }, []);

  return {
    draft,
    restored: initial.restored,
    saved,
    answer,
    go: useCallback((id) => update((d) => goTo(d, id)), [update]),
    done: useCallback(
      (id, nextId) => update((d) => goTo(markAnswered(d, id), nextId ?? d.currentQuestionId)),
      [update],
    ),
    setLanguage: useCallback((locale) => update((d) => setLocale(d, locale)), [update]),
    offerCover: useCallback((key) => update((d) => suggestCover(d, key)), [update]),
    restart: useCallback(() => {
      const fresh = createDraft({
        locale: latest.current.locale,
        country: profileCountry ?? null,
      });
      latest.current = fresh;
      setDraft(fresh);
      saveDraft(userId, fresh);
    }, [profileCountry, userId]),
    flush,
  };
}

export { FIRST_QUESTION_ID };
