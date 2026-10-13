/**
 * "Change image": the suggested covers first (best match for this ride), then every other cover
 * the app offers, then "no cover". Choosing one is the organizer's decision and from then on no
 * suggestion replaces it.
 *
 * Uploading the organizer's own picture is not offered here: the original form's cover upload
 * is a disabled "coming soon" stub, so there is no existing upload capability to reuse.
 */

import { resolveApiAssetUrl, useRideImages } from "../../lib/ride-images-dynamic";
import type { RideDraft } from "../engine/types";
import { t } from "../i18n";
import { type CoverSuggestion, suggestCovers } from "../images/resolver";
import styles from "./studio.module.css";

export function CoverSheet({
  draft,
  onPick,
  onClose,
}: {
  draft: RideDraft;
  /** `null` = no cover. */
  onPick: (key: string | null) => void;
  onClose: () => void;
}) {
  const { locale } = draft;
  const catalog = useRideImages();
  const suggested = suggestCovers(
    { rideType: draft.activityType, country: draft.country, region: draft.region },
    catalog,
    4,
  );
  const suggestedKeys = new Set(suggested.map((s) => s.key));
  const others = (catalog ?? []).filter((c) => c.selectable && !suggestedKeys.has(c.key));

  const choose = (key: string | null) => {
    onPick(key);
    onClose();
  };

  const thumb = (key: string, src: string, label: string, illustrative = false) => (
    <button
      key={key}
      type="button"
      className={styles.thumb}
      aria-pressed={draft.coverKey === key}
      onClick={() => choose(key)}
    >
      <img src={src} alt="" loading="lazy" />
      <span className={styles.thumbLabel}>
        {label}
        {illustrative ? ` · ${t(locale, "image.illustration")}` : ""}
      </span>
    </button>
  );

  return (
    <div className={styles.sheetOverlay}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={t(locale, "image.title")}
      >
        <h3 className={styles.title}>{t(locale, "image.title")}</h3>

        {suggested.length > 0 ? (
          <>
            <p className={styles.label}>{t(locale, "image.suggested")}</p>
            <div className={styles.thumbGrid}>
              {suggested.map((s: CoverSuggestion) => thumb(s.key, s.url, s.label, s.illustrative))}
            </div>
          </>
        ) : null}

        {others.length > 0 ? (
          <div className={styles.thumbGrid}>
            {others.map((c) => thumb(c.key, resolveApiAssetUrl(c.url), c.label))}
          </div>
        ) : null}

        <div className={styles.nav}>
          <button type="button" className={styles.btn} onClick={() => choose(null)}>
            {t(locale, "image.none")}
          </button>
          <span className={styles.navSpacer} />
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onClose}>
            {t(locale, "ui.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
