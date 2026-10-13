/**
 * Stage C: everything the organizer decided, laid out to check, with Edit on each row and the
 * one button that creates the ride. Nothing has touched the server until that button is
 * pressed — including everything on this screen.
 */

import { Link } from "react-router-dom";
import { COUNTRIES, flagEmoji } from "../../lib/countries";
import type { EventSummary } from "../../lib/local-db";
import { IL_REGIONS } from "../../lib/regions";
import type { QuestionDef, RideDraft } from "../engine/types";
import { formatNumber, formatStart, type StudioKey, t } from "../i18n";
import { QUESTIONS } from "../schema/questions";
import styles from "./studio.module.css";

export interface ReviewRow {
  questionId: string;
  labelKey: StudioKey;
  value: string;
}

/** The rows the review shows, in question order. Values are already in the studio language. */
export function reviewRows(draft: RideDraft): ReviewRow[] {
  const { locale } = draft;
  const country = COUNTRIES.find((c) => c.code === draft.country);
  const region = IL_REGIONS.find((r) => r.key === draft.region);
  const where = [
    draft.place.trim(),
    region ? (locale === "he" ? region.he : region.en) : "",
    country ? `${flagEmoji(country.code)} ${country.name}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const route = draft.route;
  const routeText = route
    ? [
        route.name,
        t(locale, "q.route.distance", { km: formatNumber(locale, route.route.distanceKm, 1) }),
        route.route.elevationM != null
          ? t(locale, "q.route.climb", { m: formatNumber(locale, route.route.elevationM) })
          : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  return [
    {
      questionId: "ride.type",
      labelKey: "q.type.title",
      value: draft.activityType ? t(locale, `type.${draft.activityType}` as StudioKey) : "",
    },
    { questionId: "ride.name", labelKey: "q.name.title", value: draft.name.trim() },
    { questionId: "ride.where", labelKey: "q.where.title", value: where },
    { questionId: "route.choice", labelKey: "q.route.chosen", value: routeText },
    {
      questionId: "ride.start",
      labelKey: "q.start.title",
      value: draft.startsAt ? formatStart(locale, draft.startsAt) : "",
    },
    {
      questionId: "ride.visibility",
      labelKey: "q.visibility.title",
      value: draft.visibility ? t(locale, `vis.${draft.visibility}.title` as StudioKey) : "",
    },
    {
      questionId: "ride.details",
      labelKey: "q.details.description",
      value: draft.description.trim(),
    },
  ];
}

export function ReviewScreen({
  draft,
  missing,
  creating,
  error,
  coverLabel,
  onChangeCover,
  onEdit,
  onBack,
  onCreate,
  onSaveExit,
}: {
  draft: RideDraft;
  missing: QuestionDef[];
  creating: boolean;
  error: string | null;
  /** The chosen cover's name, or null for none. */
  coverLabel: string | null;
  onChangeCover: () => void;
  onEdit: (questionId: string) => void;
  onBack: () => void;
  onCreate: () => void;
  onSaveExit: () => void;
}) {
  const { locale } = draft;
  const rows = reviewRows(draft);
  const title = QUESTIONS.find((q) => q.id === "ride.review");

  return (
    <section className={styles.screen} aria-labelledby="review-title">
      <h2 id="review-title" className={styles.title}>
        {t(locale, (title?.titleKey ?? "q.review.title") as StudioKey)}
      </h2>
      <p className={styles.hint}>{t(locale, "q.review.hint")}</p>

      <div className={styles.reviewList}>
        {rows.map((row) => (
          <div className={styles.reviewRow} key={row.questionId}>
            <span className={styles.reviewKey}>{t(locale, row.labelKey)}</span>
            <span className={styles.reviewValue} data-empty={!row.value}>
              {row.value || t(locale, "review.notSet")}
            </span>
            <button type="button" className={styles.linkBtn} onClick={() => onEdit(row.questionId)}>
              {t(locale, "review.editAnswer")}
            </button>
          </div>
        ))}
        <div className={styles.reviewRow}>
          <span className={styles.reviewKey}>{t(locale, "image.title")}</span>
          <span className={styles.reviewValue} data-empty={!coverLabel}>
            {coverLabel ?? t(locale, "image.none")}
          </span>
          <button type="button" className={styles.linkBtn} onClick={onChangeCover}>
            {t(locale, "ui.change")}
          </button>
        </div>
      </div>

      {missing.length > 0 ? (
        <div className={styles.missing} role="status">
          <strong>{t(locale, "review.missing")}</strong>
          <ul>
            {missing.map((q) => (
              <li key={q.id}>
                <button type="button" className={styles.linkBtn} onClick={() => onEdit(q.id)}>
                  {t(locale, q.titleKey as StudioKey)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.nav}>
        <button type="button" className={styles.btn} onClick={onBack} disabled={creating}>
          {t(locale, "ui.back")}
        </button>
        <span className={styles.navSpacer} />
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={onCreate}
          disabled={creating || missing.length > 0}
        >
          {t(locale, creating ? "review.creating" : "review.create")}
        </button>
      </div>
      <div>
        <button type="button" className={styles.linkBtn} onClick={onSaveExit} disabled={creating}>
          {t(locale, "ui.saveExit")}
        </button>
      </div>
    </section>
  );
}

export function CreatedScreen({
  locale,
  event,
  routeError,
  onAnother,
}: {
  locale: RideDraft["locale"];
  event: EventSummary;
  routeError: string | null;
  onAnother: () => void;
}) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(event.code);
    } catch {
      /* clipboard can be blocked; the code is on screen */
    }
  };
  return (
    <section className={`${styles.screen} ${styles.success}`} aria-live="polite">
      <div className={styles.successMark} aria-hidden="true">
        ✓
      </div>
      <h2 className={styles.title}>{t(locale, "review.created")}</h2>
      <p className={styles.hint}>{t(locale, "review.createdBody", { name: event.name })}</p>
      {event.code ? <p className={styles.cardTitle}>{event.code}</p> : null}
      {routeError ? (
        <p className={styles.error} role="alert">
          {routeError}
        </p>
      ) : null}
      <div className={styles.nav}>
        <Link className={`${styles.btn} ${styles.btnPrimary}`} to={`/events/${event.id}`}>
          {t(locale, "review.viewRide")}
        </Link>
        {event.code ? (
          <button type="button" className={styles.btn} onClick={copy}>
            {t(locale, "review.copyCode")}
          </button>
        ) : null}
      </div>
      <button type="button" className={styles.linkBtn} onClick={onAnother}>
        {t(locale, "review.another")}
      </button>
    </section>
  );
}
