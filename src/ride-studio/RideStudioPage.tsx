/**
 * Route: /events/studio — the Ride Studio conversation.
 *
 * Loads: nothing from the server until the end (ride types, countries and regions are local;
 * the cover catalogue is the app's existing GET /ride-images, fetched once per session).
 * Saves: the draft, on this device, per signed-in user — never a server event.
 * Creates: ONE ride, through the existing API, only when the organizer presses Create on the
 * review screen (adapters/createRide.ts).
 *
 * The original create form is untouched at /events/new, and this page hands anyone it cannot
 * serve straight back to it (flag off, not signed in as an organizer).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../lib/api-client";
import { useRideImages } from "../lib/ride-images-dynamic";
import { useEventsStore } from "../store/eventsStore";
import { type CreatedRide, createRide } from "./adapters/createRide";
import {
  firstOpenQuestionId,
  missingRequired,
  nextQuestionId,
  previousQuestionId,
  stageProgress,
  visibleQuestions,
} from "./engine/flow";
import type { DraftField, StudioLocale } from "./engine/types";
import { isRideStudioEnabled } from "./flag";
import { localeDir, STUDIO_LOCALES, type StudioKey, t } from "./i18n";
import { suggestCover } from "./images/resolver";
import { QUESTIONS, questionById } from "./schema/questions";
import { CoverSheet } from "./ui/CoverSheet";
import { LivePreview } from "./ui/LivePreview";
import {
  type BodyProps,
  DetailsBody,
  NameBody,
  RouteBody,
  StartBody,
  TypeBody,
  VisibilityBody,
  WhereBody,
} from "./ui/QuestionBodies";
import { QuestionScreen } from "./ui/QuestionScreen";
import { CreatedScreen, ReviewScreen } from "./ui/ReviewScreen";
import styles from "./ui/studio.module.css";
import { useRideStudio } from "./ui/useRideStudio";

const BODIES: Record<string, (props: BodyProps) => React.ReactNode> = {
  "ride.type": TypeBody,
  "ride.name": NameBody,
  "ride.where": WhereBody,
  "route.choice": RouteBody,
  "ride.start": StartBody,
  "ride.visibility": VisibilityBody,
  "ride.details": DetailsBody,
};

export function RideStudioPage() {
  const { profile } = useAuth();
  const enabled = isRideStudioEnabled({
    userId: profile?.id,
    canOrganize: profile?.canOrganize,
  });
  if (!profile || !enabled) return <Navigate to="/events/new" replace />;
  return <Studio userId={profile.id} profileCountry={profile.country ?? null} />;
}

function Studio({ userId, profileCountry }: { userId: number; profileCountry: string | null }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const studio = useRideStudio({ userId, profileCountry, fresh: params.get("fresh") === "1" });
  const { draft } = studio;
  const { locale } = draft;

  const catalog = useRideImages();
  const [attempted, setAttempted] = useState<string | null>(null);
  const [coverOpen, setCoverOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedRide | null>(null);

  const question = questionById(draft.currentQuestionId) ?? QUESTIONS[0];
  const questions = visibleQuestions(draft);
  const stages = stageProgress(draft);
  const missing = missingRequired(draft);

  // Offer a cover as the ride takes shape. A cover the organizer chose is never replaced
  // (suggestCover in the engine), and an unloaded catalogue simply offers nothing yet.
  const suggestion = useMemo(
    () =>
      suggestCover(
        { rideType: draft.activityType, country: draft.country, region: draft.region },
        catalog,
      ),
    [draft.activityType, draft.country, draft.region, catalog],
  );
  const { offerCover } = studio;
  useEffect(() => {
    if (suggestion) offerCover(suggestion.key);
  }, [suggestion, offerCover]);

  // The organizer's own time zone and language drive the page; the app shell has no `dir`.
  useEffect(() => {
    document.title = `${t(locale, "ui.studioName")} · El Niño Ride`;
  }, [locale]);

  const answerField = useCallback(
    (field: DraftField, value: unknown) => {
      studio.answer([{ questionId: question.id, field, value, source: "ui" }]);
    },
    [studio, question.id],
  );

  const goNext = useCallback(() => {
    const next = nextQuestionId(draft, question.id);
    if (next) studio.go(next);
  }, [draft, question.id, studio]);

  const onContinue = useCallback(() => {
    const problem = question.problem(draft);
    if (question.required && problem) {
      setAttempted(question.id);
      return;
    }
    setAttempted(null);
    studio.done(question.id, nextQuestionId(draft, question.id));
  }, [draft, question, studio]);

  const onBack = useCallback(() => {
    setAttempted(null);
    const prev = previousQuestionId(draft, question.id);
    if (prev) studio.go(prev);
    else navigate("/events/start");
  }, [draft, navigate, question.id, studio]);

  const onSaveExit = useCallback(() => {
    studio.flush();
    navigate("/");
  }, [navigate, studio]);

  const onCreate = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const result = await createRide(draft);
      useEventsStore.getState().upsertRide(result.event);
      // Done: a fresh draft replaces the finished one, so nothing about this ride is offered
      // for resume and a second ride never reuses its submission id.
      studio.restart();
      setCreated(result);
    } catch (err) {
      // The draft is untouched, so the organizer can fix whatever it was and try again; the
      // same submission id makes that retry safe even if the first request did arrive.
      setCreateError(err instanceof ApiError ? err.message : t(locale, "review.error"));
    } finally {
      setCreating(false);
    }
  }, [creating, draft, locale, studio]);

  const setLanguage = (next: StudioLocale) => studio.setLanguage(next);
  const error =
    attempted === question.id && question.problem(draft)
      ? t(locale, question.problem(draft) as StudioKey)
      : null;

  const Body = BODIES[question.id];

  return (
    <div className={styles.root} dir={localeDir(locale)} lang={locale} data-testid="ride-studio">
      <header className={styles.bar}>
        <span className={styles.brand}>{t(locale, "ui.studioName")}</span>
        <span className={styles.saved} aria-live="polite">
          {studio.saved ? t(locale, "ui.draftSaved") : ""}
        </span>
        <fieldset className={styles.langGroup}>
          <legend className={styles.srOnly}>{t(locale, "ui.language")}</legend>
          {STUDIO_LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              className={styles.langBtn}
              aria-pressed={locale === l}
              onClick={() => setLanguage(l)}
            >
              {l === "he" ? "עב" : "EN"}
            </button>
          ))}
        </fieldset>
      </header>

      {!created ? (
        <nav className={styles.stages} aria-label={t(locale, "ui.studioName")}>
          {stages.map((s) => {
            const first = questions.find((q) => q.stage === s.stage);
            return (
              <button
                key={s.stage}
                type="button"
                className={`${styles.stage} ${styles.btnGhost}`}
                data-active={s.active}
                data-done={s.total > 0 && s.done === s.total}
                aria-current={s.active ? "step" : undefined}
                onClick={() => first && studio.go(first.id)}
              >
                {t(locale, `stage.${s.stage}` as StudioKey)}
              </button>
            );
          })}
        </nav>
      ) : null}

      <main className={styles.shell}>
        <div>
          {created ? (
            <CreatedScreen
              locale={locale}
              event={created.event}
              routeError={created.routeError}
              onAnother={() => setCreated(null)}
            />
          ) : question.kind === "review" ? (
            <ReviewScreen
              draft={draft}
              missing={missing}
              creating={creating}
              error={createError}
              onEdit={(id) => studio.go(id)}
              onBack={onBack}
              onCreate={onCreate}
              onSaveExit={onSaveExit}
            />
          ) : Body ? (
            <QuestionScreen
              locale={locale}
              title={t(locale, question.titleKey as StudioKey)}
              hint={question.hintKey ? t(locale, question.hintKey as StudioKey) : undefined}
              error={error}
              onBack={onBack}
              onContinue={onContinue}
              onSkip={
                question.required
                  ? undefined
                  : () => {
                      setAttempted(null);
                      studio.done(question.id, nextQuestionId(draft, question.id));
                    }
              }
              onSaveExit={onSaveExit}
            >
              <Body
                draft={draft}
                locale={locale}
                onAnswer={answerField}
                onAdvance={goNext}
                wasAnswered={draft.answered.includes(question.id)}
                onSubmit={onContinue}
              />
            </QuestionScreen>
          ) : null}
        </div>

        {!created ? (
          <div className={styles.previewAside}>
            <LivePreview draft={draft} onChangeCover={() => setCoverOpen(true)} />
          </div>
        ) : null}
      </main>

      {coverOpen ? (
        <CoverSheet
          draft={draft}
          onPick={(key) =>
            studio.answer([
              { questionId: "ride.cover", field: "coverKey", value: key, source: "ui" },
            ])
          }
          onClose={() => setCoverOpen(false)}
        />
      ) : null}
    </div>
  );
}

export { firstOpenQuestionId };
