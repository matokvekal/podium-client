/**
 * The ride as it will look, rebuilt from the draft on every change: the organizer watches their
 * ride take shape. Read-only apart from "Change image", which opens the cover picker.
 *
 * On a phone it is a slim bar that expands; from 900px up it sits beside the conversation.
 */

import { useState } from "react";
import { COUNTRIES, flagEmoji } from "../../lib/countries";
import { IL_REGIONS } from "../../lib/regions";
import { resolveRideImage, useRideImages } from "../../lib/ride-images-dynamic";
import { SURFACE_TYPE_ICON } from "../../lib/surface-types";
import type { RideDraft } from "../engine/types";
import { formatNumber, formatStart, type StudioKey, t } from "../i18n";
import { isIllustrativeCover } from "../images/resolver";
import styles from "./studio.module.css";

export function LivePreview({
  draft,
  onChangeCover,
}: {
  draft: RideDraft;
  onChangeCover: () => void;
}) {
  const { locale } = draft;
  const [open, setOpen] = useState(false);
  const catalog = useRideImages();
  const cover = resolveRideImage(catalog, draft.coverKey);

  const name = draft.name.trim();
  const country = COUNTRIES.find((c) => c.code === draft.country);
  const region = IL_REGIONS.find((r) => r.key === draft.region);
  const place = [
    draft.place.trim(),
    region ? (locale === "he" ? region.he : region.en) : "",
    country ? `${flagEmoji(country.code)} ${country.name}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const Icon = draft.activityType ? SURFACE_TYPE_ICON[draft.activityType] : null;
  const route = draft.route;
  const start = draft.startsAt ? formatStart(locale, draft.startsAt) : "";

  return (
    <aside className={styles.preview} data-open={open} aria-label={t(locale, "preview.title")}>
      <button
        type="button"
        className={styles.previewToggle}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <strong>{name || t(locale, "preview.untitled")}</strong>
        <span className={styles.linkBtn}>{t(locale, open ? "preview.hide" : "preview.show")}</span>
      </button>

      <div className={styles.previewBody}>
        <div className={styles.cover}>
          {cover ? (
            <img className={styles.coverImg} src={cover.src} alt={cover.label} key={cover.key} />
          ) : null}
          {cover && isIllustrativeCover(cover.key) ? (
            <span className={styles.coverBadge}>{t(locale, "image.illustration")}</span>
          ) : null}
          <button type="button" className={styles.coverChange} onClick={onChangeCover}>
            {t(locale, cover ? "image.change" : "image.pick")}
          </button>
        </div>

        <div className={styles.previewInfo}>
          <div className={styles.badges}>
            {draft.activityType ? (
              <span className={styles.badge}>
                {Icon ? <Icon width={12} height={12} aria-hidden="true" /> : null}{" "}
                {t(locale, `type.${draft.activityType}` as StudioKey)}
              </span>
            ) : null}
            {draft.visibility ? (
              <span className={styles.badge}>
                {t(locale, `vis.${draft.visibility}.title` as StudioKey)}
              </span>
            ) : null}
          </div>

          <h3 className={styles.previewName} data-empty={!name}>
            {name || t(locale, "preview.untitled")}
          </h3>

          <div className={styles.previewLine} data-empty={!place}>
            {place || t(locale, "preview.noPlace")}
          </div>
          <div className={styles.previewLine} data-empty={!start}>
            {start || t(locale, "preview.noDate")}
          </div>
          <div className={styles.previewLine} data-empty={!route}>
            {route
              ? [
                  t(locale, "q.route.distance", {
                    km: formatNumber(locale, route.route.distanceKm, 1),
                  }),
                  route.route.elevationM != null
                    ? t(locale, "q.route.climb", {
                        m: formatNumber(locale, route.route.elevationM),
                      })
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : t(locale, "preview.noRoute")}
          </div>
        </div>
      </div>
    </aside>
  );
}
