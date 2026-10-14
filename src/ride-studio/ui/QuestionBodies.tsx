/**
 * The answer area for each question. Each body reads the draft and reports a change as one
 * normalised answer through `onAnswer(field, value)` — it never touches the draft or the server
 * itself, so the same values could just as well arrive from text, voice or an interpreter.
 */

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { TrackUploadButton, type UploadedTrack } from "../../app/TrackUploadButton";
import { apiRequest } from "../../lib/api-client";
import { COUNTRIES, flagEmoji, orderedCountries } from "../../lib/countries";
import { DESCRIPTION_MAX_CHARS } from "../../lib/event-limits";
import type { EventRoute } from "../../lib/event-route";
import type { EventSummary } from "../../lib/local-db";
import { IL_REGIONS } from "../../lib/regions";
import {
  type DraftField,
  type RideDraft,
  STUDIO_RIDE_TYPES,
  type StudioLocale,
  type StudioRideType,
} from "../engine/types";
import { formatNumber, type StudioKey, t } from "../i18n";
import { TYPE_IMAGES } from "../images/type-images";
import { StartPicker } from "./StartPicker";
import styles from "./studio.module.css";

const TrackGallerySheet = lazy(() =>
  import("../../app/TrackGallerySheet").then((m) => ({ default: m.TrackGallerySheet })),
);

export interface BodyProps {
  draft: RideDraft;
  locale: StudioLocale;
  onAnswer: (field: DraftField, value: unknown) => void;
  /** Move on after a deliberate one-tap choice. */
  onAdvance: () => void;
  /** True when this question was already answered (so a tap should not jump ahead again). */
  wasAnswered: boolean;
  onSubmit: () => void;
}

// ── ride type ─────────────────────────────────────────────────────────────────────────────

/** One ride-type card: a landscape picture, the name, one motivating line, a check when chosen.
 *  The picture is decoration (the name beside it says the same), and a file that cannot load
 *  simply leaves the card's gradient showing. */
function TypeCard({
  type,
  locale,
  selected,
  onChoose,
}: {
  type: StudioRideType;
  locale: StudioLocale;
  selected: boolean;
  onChoose: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const image = TYPE_IMAGES[type];
  const bodyId = `ride-type-${type}-body`;
  return (
    <button
      type="button"
      className={styles.typeCard}
      aria-pressed={selected}
      aria-label={t(locale, `typeCard.${type}.title` as StudioKey)}
      aria-describedby={bodyId}
      data-ride-type={type}
      onClick={onChoose}
    >
      <span className={styles.typeThumb} style={{ background: image.gradient }}>
        {broken ? null : (
          <img
            src={image.src}
            alt=""
            width={960}
            height={540}
            loading="lazy"
            decoding="async"
            onError={() => setBroken(true)}
          />
        )}
      </span>
      <span className={styles.typeText}>
        <span className={styles.cardTitle}>{t(locale, `typeCard.${type}.title` as StudioKey)}</span>
        <span className={styles.cardBody} id={bodyId}>
          {t(locale, `typeCard.${type}.body` as StudioKey)}
        </span>
      </span>
      <span className={styles.typeCheck} aria-hidden="true">
        ✓
      </span>
    </button>
  );
}

export function TypeBody({ draft, locale, onAnswer, onAdvance, wasAnswered }: BodyProps) {
  return (
    <fieldset className={`${styles.cards} ${styles.cardsOne}`}>
      <legend className={styles.srOnly}>{t(locale, "ui.chooseOne")}</legend>
      {STUDIO_RIDE_TYPES.map((type) => (
        <TypeCard
          key={type}
          type={type}
          locale={locale}
          selected={draft.activityType === type}
          onChoose={() => {
            onAnswer("activityType", type);
            if (!wasAnswered) onAdvance();
          }}
        />
      ))}
    </fieldset>
  );
}

// ── name ──────────────────────────────────────────────────────────────────────────────────

export function NameBody({ draft, locale, onAnswer, onSubmit }: BodyProps) {
  const input = useRef<HTMLInputElement>(null);
  // The next thing to do on this screen is type: put the cursor there.
  useEffect(() => {
    input.current?.focus();
  }, []);
  return (
    <div className={styles.field}>
      <input
        ref={input}
        className={styles.input}
        type="text"
        aria-label={t(locale, "q.name.title")}
        value={draft.name}
        maxLength={255}
        placeholder={t(locale, "q.name.placeholder")}
        onChange={(e) => onAnswer("name", e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
    </div>
  );
}

// ── where ─────────────────────────────────────────────────────────────────────────────────

export function WhereBody({ draft, locale, onAnswer }: BodyProps) {
  // A fixed order: re-sorting by the current pick would make the list jump under the finger.
  const countries = orderedCountries("IL");
  return (
    <>
      <label className={styles.field}>
        <span className={styles.label}>{t(locale, "q.where.country")}</span>
        <select
          className={styles.select}
          value={draft.country ?? ""}
          onChange={(e) => onAnswer("country", e.target.value || null)}
        >
          <option value="">{t(locale, "ui.selectFromList")}</option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {flagEmoji(c.code)} {c.name}
            </option>
          ))}
        </select>
      </label>

      {draft.country === "IL" ? (
        <label className={styles.field}>
          <span className={styles.label}>{t(locale, "q.where.region")}</span>
          <select
            className={styles.select}
            value={draft.region ?? ""}
            onChange={(e) => onAnswer("region", e.target.value || null)}
          >
            <option value="">{t(locale, "q.where.regionAny")}</option>
            {IL_REGIONS.map((r) => (
              <option key={r.key} value={r.key}>
                {locale === "he" ? r.he : r.en}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className={styles.field}>
        <span className={styles.label}>
          {t(locale, "q.where.place")} · {t(locale, "ui.optional")}
        </span>
        <input
          className={styles.input}
          type="text"
          value={draft.place}
          maxLength={255}
          placeholder={t(locale, "q.where.placeHint")}
          onChange={(e) => onAnswer("place", e.target.value)}
        />
      </label>
    </>
  );
}

// ── route ─────────────────────────────────────────────────────────────────────────────────

export function RouteBody({ draft, locale, onAnswer }: BodyProps) {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function pickFromGallery(event: EventSummary) {
    setGalleryOpen(false);
    setLoading(true);
    setProblem(null);
    try {
      // The same source the original form copies from: the ride's own saved route.
      const route = await apiRequest<EventRoute | null>(`/events/${event.id}/route`);
      if (!route || route.points.length < 2) {
        setProblem(t(locale, "err.route"));
        return;
      }
      onAnswer("route", { kind: "library", name: event.name, route, sourceEventId: event.id });
    } catch {
      setProblem(t(locale, "err.route"));
    } finally {
      setLoading(false);
    }
  }

  function onUploaded(uploaded: UploadedTrack) {
    setProblem(null);
    onAnswer("route", {
      kind: "gpx",
      name: uploaded.fileName,
      route: uploaded.route,
      sourceEventId: null,
    });
  }

  const route = draft.route;
  return (
    <>
      {route ? (
        <div className={styles.chosen}>
          <div className={styles.chosenText}>
            <div className={styles.chosenName}>{route.name}</div>
            <div className={styles.chosenMeta}>
              {t(locale, "q.route.distance", {
                km: formatNumber(locale, route.route.distanceKm, 1),
              })}
              {route.route.elevationM != null
                ? ` · ${t(locale, "q.route.climb", { m: formatNumber(locale, route.route.elevationM) })}`
                : ""}
            </div>
          </div>
          <button
            type="button"
            className={styles.btn}
            onClick={() => {
              onAnswer("route", null);
            }}
          >
            {t(locale, "ui.remove")}
          </button>
        </div>
      ) : (
        <div className={`${styles.cards} ${styles.cardsOne}`}>
          <button
            type="button"
            className={styles.card}
            onClick={() => setGalleryOpen(true)}
            disabled={loading}
          >
            <span className={styles.cardTitle}>{t(locale, "q.route.library")}</span>
            <span className={styles.cardBody}>{t(locale, "q.route.libraryHint")}</span>
          </button>
          <TrackUploadButton onUploadRoute={onUploaded} className={styles.card}>
            <span className={styles.cardTitle}>{t(locale, "q.route.upload")}</span>
            <span className={styles.cardBody}>{t(locale, "q.route.uploadHint")}</span>
          </TrackUploadButton>
        </div>
      )}
      {problem ? (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      ) : null}
      {galleryOpen ? (
        <Suspense fallback={null}>
          <TrackGallerySheet
            onPick={pickFromGallery}
            onClose={() => setGalleryOpen(false)}
            initialSurface={draft.activityType ?? undefined}
          />
        </Suspense>
      ) : null}
    </>
  );
}

// ── start ─────────────────────────────────────────────────────────────────────────────────

export function StartBody(props: BodyProps) {
  return <StartPicker {...props} />;
}

// ── visibility ────────────────────────────────────────────────────────────────────────────

export function VisibilityBody({ draft, locale, onAnswer, onAdvance, wasAnswered }: BodyProps) {
  return (
    <fieldset className={`${styles.cards} ${styles.cardsOne}`}>
      <legend className={styles.srOnly}>{t(locale, "ui.chooseOne")}</legend>
      {(["public", "private"] as const).map((v) => (
        <button
          key={v}
          type="button"
          className={styles.card}
          aria-pressed={draft.visibility === v}
          onClick={() => {
            onAnswer("visibility", v);
            if (!wasAnswered) onAdvance();
          }}
        >
          <span className={styles.cardTitle}>{t(locale, `vis.${v}.title` as StudioKey)}</span>
          <span className={styles.cardBody}>{t(locale, `vis.${v}.body` as StudioKey)}</span>
        </button>
      ))}
    </fieldset>
  );
}

// ── optional details ──────────────────────────────────────────────────────────────────────

export function DetailsBody({ draft, locale, onAnswer }: BodyProps) {
  return (
    <>
      <label className={styles.field}>
        <span className={styles.label}>{t(locale, "q.details.description")}</span>
        <textarea
          className={styles.textarea}
          value={draft.description}
          maxLength={DESCRIPTION_MAX_CHARS}
          placeholder={t(locale, "q.details.descriptionPlaceholder")}
          onChange={(e) => onAnswer("description", e.target.value)}
        />
      </label>
      {draft.visibility === "public" ? (
        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={draft.requiresApproval}
            onChange={(e) => onAnswer("requiresApproval", e.target.checked)}
          />
          <span>{t(locale, "q.details.approval")}</span>
        </label>
      ) : null}
      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={draft.joinAsRider}
          onChange={(e) => onAnswer("joinAsRider", e.target.checked)}
        />
        <span>{t(locale, "q.details.joinAsRider")}</span>
      </label>
    </>
  );
}

export { COUNTRIES };
