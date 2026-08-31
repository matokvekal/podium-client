/**
 * "We'd love to hear from you" — the one place a rider can reach a human.
 *
 * Opened from the drawer, and open to everyone: someone hitting a bug before they have an
 * account is exactly who most needs to be able to say so.
 *
 * The address, the three topics and the mailto draft they open all live in lib/contact.ts;
 * this file is the sheet around them. Two details there are what separate a useful report from
 * a useless one — a bug draft is pre-filled with the app version and browser the reporter
 * cannot be expected to dig out, and the address is shown in full with a Copy button because
 * a mailto: link silently does nothing on a machine with no mail client, which must not be a
 * dead end.
 *
 * Same bottom-sheet pattern as SafetySheet/CopyTrackSheet — portal, overlay, slide-up panel,
 * Escape to close.
 */

import { Bug, Check, Copy, Lightbulb, Mail, MessageCircleQuestion } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { config } from "../lib/config";
import {
  buildContactMailto,
  CONTACT_EMAIL,
  CONTACT_TOPICS,
  type ContactContext,
  type ContactTopicId,
} from "../lib/contact";
import styles from "./ContactSheet.module.css";

// Icons stay here rather than in lib/contact.ts, which has no business importing React.
const TOPIC_ICON: Record<ContactTopicId, typeof Bug> = {
  bug: Bug,
  idea: Lightbulb,
  question: MessageCircleQuestion,
};

/** Read at click time, not at mount: the sheet can sit open while nothing else changes, but
 *  the values should describe the moment the rider decided to write. */
function currentContext(): ContactContext {
  return {
    appVersion: config.appVersion,
    // pathname only — never search or hash, which can carry a join code or another event's id.
    page: window.location.pathname,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    userAgent: navigator.userAgent,
  };
}

export function ContactSheet({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard refused (insecure context, permission denied): the address is on screen in
      // full, so it can still be read and typed. Nothing worth reporting.
    }
  }

  return createPortal(
    <>
      <div className={styles.overlay} onClick={onClose} aria-hidden="true" />
      <div
        className={`${styles.sheet} ${styles.sheetOpen}`}
        role="dialog"
        aria-label="Contact the El Niño Move team"
      >
        <div className={styles.header}>
          <span className={styles.headerTitle}>
            <Mail aria-hidden="true" className={styles.headerIcon} />
            We'd love to hear from you
          </span>
          <button
            type="button"
            className="button button--quiet"
            onClick={onClose}
            aria-label="Close"
          >
            Close
          </button>
        </div>

        <div className={styles.body}>
          <p className={styles.intro}>
            This app is built by riders, and it gets better every time someone tells us what isn't
            working. Pick what fits and we'll open a draft — a real person reads every one.
          </p>

          <ul className={styles.list}>
            {CONTACT_TOPICS.map((topic) => {
              const Icon = TOPIC_ICON[topic.id];
              return (
                <li key={topic.id}>
                  {/* A real link, so it gets link behaviour: middle-click, long-press, and a
                      focus ring. href is built at render; the context it embeds is read fresh
                      on click. */}
                  <a
                    className={styles.topic}
                    href={buildContactMailto(topic, currentContext())}
                    onClick={onClose}
                  >
                    <Icon aria-hidden="true" className={styles.topicIcon} />
                    <span className={styles.topicText}>
                      <span className={styles.topicLabel}>{topic.label}</span>
                      <span className={styles.topicNote}>{topic.note}</span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>

          <div className={styles.addressRow}>
            <span className={styles.addressLabel}>Or write to us directly</span>
            <span className={styles.address}>
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
              <button
                type="button"
                className="button button--quiet"
                onClick={copyAddress}
                aria-label="Copy email address"
              >
                {copied ? (
                  <Check width={15} height={15} aria-hidden="true" />
                ) : (
                  <Copy width={15} height={15} aria-hidden="true" />
                )}
              </button>
            </span>
          </div>

          <p className={styles.version}>Version {config.appVersion}</p>
        </div>
      </div>
    </>,
    document.body,
  );
}
