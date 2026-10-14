/**
 * Route: /events/start — "New ride", the fork between the original form and Ride Studio.
 *
 * Only ever reached through NewRideLink, which sends people here only when Ride Studio is
 * switched on for them. Everyone else — and anyone who lands here some other way while it is off
 * — is sent straight to the original form, untouched, at /events/new.
 */

import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { defaultStudioLocale, draftHasContent } from "./engine/draft";
import { loadDraft } from "./engine/draft-storage";
import { readLocalePref, writeLocalePref } from "./engine/locale-pref";
import {
  type CreateMethod,
  readCreateMethod,
  useRideStudioEnabled,
  writeCreateMethod,
} from "./flag";
import { localeDir, STUDIO_LOCALES, t } from "./i18n";
import styles from "./ui/studio.module.css";

export function EntryChoicePage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [remember, setRemember] = useState(false);
  const [picked, setPicked] = useState(readLocalePref);

  const enabled = useRideStudioEnabled({ userId: profile?.id, canOrganize: profile?.canOrganize });
  if (!profile || !enabled) return <Navigate to="/events/new" replace />;

  const remembered = readCreateMethod();
  if (remembered && params.get("choose") !== "1") {
    return <Navigate to={remembered === "studio" ? "/events/studio" : "/events/new"} replace />;
  }

  const stored = loadDraft(profile.id);
  const draft = stored && draftHasContent(stored) ? stored : null;
  // The rider's own choice first, then what an unfinished draft was using, then the country /
  // device default (which ends at English).
  const locale = picked ?? draft?.locale ?? defaultStudioLocale(profile.country);

  const choose = (method: CreateMethod, to: string) => {
    if (remember) writeCreateMethod(method);
    navigate(to);
  };

  return (
    <div className={styles.root} dir={localeDir(locale)} lang={locale}>
      <div className={styles.entry}>
        <fieldset className={styles.langGroup} data-entry-language>
          <legend className={styles.srOnly}>{t(locale, "ui.language")}</legend>
          {STUDIO_LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              className={styles.langBtn}
              aria-pressed={locale === l}
              onClick={() => {
                writeLocalePref(l);
                setPicked(l);
              }}
            >
              {l === "he" ? "עב" : "EN"}
            </button>
          ))}
        </fieldset>
        <h1 className={styles.title}>{t(locale, "entry.title")}</h1>
        <p className={styles.hint}>{t(locale, "entry.subtitle")}</p>

        {draft ? (
          <button
            type="button"
            className={`${styles.card} ${styles.btnPrimary}`}
            onClick={() => choose("studio", "/events/studio")}
          >
            <span className={styles.cardTitle}>
              {draft.name.trim()
                ? t(locale, "entry.resume.named", { name: draft.name.trim() })
                : t(locale, "entry.resume")}
            </span>
          </button>
        ) : null}

        <div className={`${styles.cards} ${styles.cardsOne}`}>
          <button
            type="button"
            className={styles.card}
            onClick={() => choose("normal", "/events/new")}
          >
            <span className={styles.cardTitle}>{t(locale, "entry.normal.title")}</span>
            <span className={styles.cardBody}>{t(locale, "entry.normal.body")}</span>
          </button>
          <button
            type="button"
            className={styles.card}
            onClick={() => choose("studio", draft ? "/events/studio?fresh=1" : "/events/studio")}
          >
            <span className={styles.cardTitle}>{t(locale, "entry.studio.title")}</span>
            <span className={styles.cardBody}>{t(locale, "entry.studio.body")}</span>
          </button>
        </div>

        {draft ? <p className={styles.hint}>{t(locale, "entry.discard")}</p> : null}

        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <span>{t(locale, "entry.remember")}</span>
        </label>

        <Link className={styles.linkBtn} to="/">
          {t(locale, "ui.close")}
        </Link>
      </div>
    </div>
  );
}
