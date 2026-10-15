/**
 * "About El Niño" — a small pill beside the header title that opens a cinematic welcome modal.
 *
 * The pill is shown only until the rider opens the modal once (localStorage
 * `elnino-about-seen-v1`); it never opens on its own. The modal carries its own Hebrew/English
 * copy — the app has no i18n framework (lib/app-tagline.ts is display-only), so the starting
 * language follows the same guess as the header subtitle and the rider can switch.
 *
 * The text rises slowly from the bottom (~15s, eased to a stop) and then stays put, readable and
 * scrollable. Tapping the text skips to the end; switching language restarts it (the text block
 * is keyed on the language); prefers-reduced-motion shows it in place with no movement.
 *
 * Same portal + Escape-to-close pattern as SafetySheet.
 */

import { X } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./AboutElNino.module.css";

const SEEN_KEY = "elnino-about-seen-v1";

type Lang = "he" | "en";

type Block = { kind: "title" | "lead" | "heading" | "p" | "strong" | "sign"; text: string };

const CONTENT: Record<Lang, Block[]> = {
  he: [
    { kind: "title", text: "נעים להכיר, El Niño 🚴" },
    { kind: "lead", text: "רוכבים ביחד. מגלים מסלולים. שומרים על העולם. 🌍" },
    { kind: "p", text: "אל ניניו היא אפליקציה חברתית לאוהבי רכיבת האופניים." },
    {
      kind: "p",
      text: "כאן תוכלו להצטרף לרכיבות, ליצור רכיבות אישיות או קבוצתיות בכביש, בשטח ובגרבל, ולשתף אותן עם חברים או עם קהילת הרוכבים כולה.",
    },
    {
      kind: "p",
      text: "תוכלו לגלות מאות מסלולי רכיבה קיימים, להשתמש בהם לתכנון הרכיבה הבאה שלכם, או להעלות מסלול GPX משלכם.",
    },
    { kind: "heading", text: "ולמה דווקא El Niño? 🌱" },
    {
      kind: "p",
      text: "רכיבה על אופניים היא לא רק ספורט והנאה. היא גם דרך בריאה, יעילה וידידותית לסביבה להגיע ממקום למקום.",
    },
    {
      kind: "p",
      text: 'השם El Niño, שפירושו בספרדית "הילד", מוכר גם כתופעת אקלים המשפיעה על מזג האוויר ברחבי העולם. בחרנו בשם הזה כדי להזכיר לכולנו כמה חשוב לשמור על כדור הארץ שלנו.',
    },
    {
      kind: "strong",
      text: "אז צאו לרכוב, תגלו מקומות חדשים, תכירו חברים ותשמרו על הסביבה.",
    },
    { kind: "strong", text: "🚴 מאחלים לכם כמה שיותר רכיבות, ותמיד בבטחה!" },
    { kind: "sign", text: "צוות El Niño 💚" },
  ],
  en: [
    { kind: "title", text: "Welcome to El Niño 🚴" },
    { kind: "lead", text: "Ride together. Discover new routes. Protect our planet. 🌍" },
    { kind: "p", text: "El Niño is a social platform for cycling enthusiasts." },
    {
      kind: "p",
      text: "Join rides, create personal or group cycling adventures on roads, trails, and gravel, and share them with friends or the entire cycling community.",
    },
    {
      kind: "p",
      text: "Explore hundreds of existing cycling routes, use them to plan your next adventure, or upload your own GPX route.",
    },
    { kind: "heading", text: "Why El Niño? 🌱" },
    {
      kind: "p",
      text: "Cycling is more than sport and enjoyment. It's a healthy, efficient, and environmentally friendly way to travel.",
    },
    {
      kind: "p",
      text: 'El Niño means "the child" in Spanish and is also the name of a climate phenomenon that affects weather patterns worldwide. We chose this name to remind ourselves how important it is to protect our planet.',
    },
    {
      kind: "strong",
      text: "So get out, ride more, discover new places, make new friends, and care for our environment.",
    },
    { kind: "strong", text: "🚴 Wishing you many wonderful rides — always ride safely!" },
    { kind: "sign", text: "The El Niño Team 💚" },
  ],
};

const UI: Record<Lang, { dialog: string; close: string; skip: string }> = {
  he: { dialog: "להכיר את אל ניניו", close: "סגירה", skip: "הקישו לדילוג" },
  en: { dialog: "About El Niño", close: "Close", skip: "Tap to skip" },
};

function readSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Private mode / blocked storage: the pill just comes back next visit.
  }
}

/** The header pill + the modal it opens. `language` is the header subtitle's language. */
export function AboutElNino({ language }: { language: string }) {
  const [seen, setSeen] = useState(readSeen);
  const [open, setOpen] = useState(false);
  const startLang: Lang = language === "he" ? "he" : "en";

  function openModal() {
    markSeen();
    setSeen(true);
    setOpen(true);
  }

  return (
    <>
      {!seen && (
        <button
          type="button"
          className={styles.pill}
          onClick={openModal}
          aria-label="About El Niño / להכיר את אל ניניו"
          lang={startLang}
          dir={startLang === "he" ? "rtl" : "ltr"}
        >
          <span aria-hidden="true">🌿</span>
          <span className={styles.pillLong}>
            {startLang === "he" ? "להכיר את אל ניניו" : "About El Niño"}
          </span>
          <span className={styles.pillShort}>{startLang === "he" ? "הכירו" : "About"}</span>
        </button>
      )}
      {open && <WelcomeModal initialLang={startLang} onClose={() => setOpen(false)} />}
    </>
  );
}

export function WelcomeModal({ initialLang, onClose }: { initialLang: Lang; onClose: () => void }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [skipped, setSkipped] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  function switchLang(next: Lang) {
    if (next === lang) return;
    setLang(next);
    setSkipped(false);
  }

  const dir = lang === "he" ? "rtl" : "ltr";
  const ui = UI[lang];

  return createPortal(
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={ui.dialog}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.bg} aria-hidden="true" />
        <div className={styles.shade} aria-hidden="true" />

        <div className={styles.topBar}>
          <span className={styles.logoBadge} aria-hidden="true">
            <img src="/logo.png" alt="" width={52} height={52} />
          </span>
          <div className={styles.langToggle} dir="ltr" role="group" aria-label="Language">
            <button
              type="button"
              aria-pressed={lang === "he"}
              className={lang === "he" ? styles.langActive : undefined}
              onClick={() => switchLang("he")}
              lang="he"
            >
              עברית
            </button>
            <span className={styles.langSep} aria-hidden="true">
              |
            </span>
            <button
              type="button"
              aria-pressed={lang === "en"}
              className={lang === "en" ? styles.langActive : undefined}
              onClick={() => switchLang("en")}
              lang="en"
            >
              English
            </button>
          </div>
          <button
            ref={closeRef}
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label={ui.close}
          >
            <X aria-hidden="true" />
          </button>
        </div>

        <div className={styles.viewport}>
          <div
            key={lang}
            className={`${styles.crawl} ${skipped ? styles.crawlSkipped : ""}`}
            lang={lang}
            dir={dir}
            onClick={() => setSkipped(true)}
            onAnimationEnd={() => setSkipped(true)}
            title={skipped ? undefined : ui.skip}
          >
            {CONTENT[lang].map((block, i) => (
              <Fragment key={i}>{renderBlock(block)}</Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function renderBlock(block: Block) {
  switch (block.kind) {
    case "title":
      return <h2 className={styles.title}>{block.text}</h2>;
    case "lead":
      return <p className={styles.lead}>{block.text}</p>;
    case "heading":
      return <h3 className={styles.heading}>{block.text}</h3>;
    case "strong":
      return <p className={styles.strong}>{block.text}</p>;
    case "sign":
      return <p className={styles.sign}>{block.text}</p>;
    default:
      return <p className={styles.p}>{block.text}</p>;
  }
}
