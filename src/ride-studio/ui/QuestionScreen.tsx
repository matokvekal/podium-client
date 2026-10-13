/**
 * The one layout every question uses: title + hint on top, the answer in the middle, and the
 * same Back / Continue / Save & exit (and Skip, when the question is optional) underneath.
 * The input type changes from question to question; this frame never does, which is what keeps
 * the studio feeling like one conversation rather than a stack of different forms.
 */

import { type ReactNode, useId } from "react";
import type { StudioLocale } from "../engine/types";
import { t } from "../i18n";
import styles from "./studio.module.css";

interface Props {
  locale: StudioLocale;
  title: string;
  hint?: string;
  /** An already-translated message about the current answer, shown under it. */
  error?: string | null;
  children: ReactNode;
  onBack: () => void;
  onContinue?: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  onSkip?: () => void;
  onSaveExit: () => void;
}

export function QuestionScreen({
  locale,
  title,
  hint,
  error,
  children,
  onBack,
  onContinue,
  continueLabel,
  continueDisabled,
  onSkip,
  onSaveExit,
}: Props) {
  const headingId = useId();
  return (
    <section className={styles.screen} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.title}>
        {title}
      </h2>
      {hint ? <p className={styles.hint}>{hint}</p> : null}

      <div className={styles.answer}>{children}</div>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.nav}>
        <button type="button" className={styles.btn} onClick={onBack}>
          {t(locale, "ui.back")}
        </button>
        <span className={styles.navSpacer} />
        {onSkip ? (
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={onSkip}>
            {t(locale, "ui.skip")}
          </button>
        ) : null}
        {onContinue ? (
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={onContinue}
            disabled={continueDisabled}
          >
            {continueLabel ?? t(locale, "ui.continue")}
          </button>
        ) : null}
      </div>
      <div>
        <button type="button" className={styles.linkBtn} onClick={onSaveExit}>
          {t(locale, "ui.saveExit")}
        </button>
      </div>
    </section>
  );
}
