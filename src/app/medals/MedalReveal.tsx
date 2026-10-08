// THE MEDAL MOMENT. When the rider opens the app holding medals they have not seen yet
// (profile.unseenMedalCount > 0), a full-screen reveal plays ONCE: the medal drops in and
// settles, gold light sweeps across it, confetti falls, the phone gives a short buzz. Then
// "See my medals" (-> Statistics → Achievements → Medals) or "Close". Either way the medals shown
// are marked seen on the server, so it never plays again for them — on any device.
//
// Costs nothing when there is nothing new: the only request is made when the profile already says
// there are unseen medals. Reduced motion: no drop, no confetti, no buzz — a plain fade.
// Never shown on the Medals tab itself (the tab is already the celebration).

import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { detectTextDirection } from "../../lib/text-direction";
import { type EventMedal, formatMedalDate } from "../../lib/medal";
import { medalBackgroundVars } from "../../lib/medal-backgrounds";
import { fetchMedalsPage } from "../../store/medalsStore";
import { Confetti } from "./Confetti";
import { MedalBadge } from "./MedalBadge";
import styles from "./Medals.module.css";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import { useClearUnseenMedals } from "./useClearUnseenMedals";

export function MedalReveal() {
  const { status, profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const reduced = usePrefersReducedMotion();
  const clearUnseen = useClearUnseenMedals();
  const [medals, setMedals] = useState<EventMedal[] | null>(null);
  const triedRef = useRef(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Escape calls the latest close() without re-binding the listener on every render.
  const closeRef2 = useRef<() => Promise<void>>(async () => undefined);

  const unseen = profile?.unseenMedalCount ?? 0;
  const onMedalsTab =
    location.pathname === "/stats/achievements" && location.search.includes("tab=medals");

  useEffect(() => {
    if (status !== "signed-in" || unseen <= 0 || onMedalsTab || triedRef.current) return;
    triedRef.current = true;
    let cancelled = false;
    fetchMedalsPage(null, 5)
      .then((page) => {
        const fresh = page.medals.filter((m) => !m.seen);
        if (!cancelled && fresh.length > 0) setMedals(fresh);
      })
      .catch(() => undefined); // a medal problem never shows the rider an error here
    return () => {
      cancelled = true;
    };
  }, [status, unseen, onMedalsTab]);

  useEffect(() => {
    if (!medals) return;
    if (!reduced) navigator.vibrate?.([30, 60, 40]);
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void closeRef2.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [medals, reduced]);

  if (!medals) return null;
  const [first] = medals;
  if (!first) return null;
  const many = medals.length > 1;
  closeRef2.current = () => close();

  async function close(goToMedals = false) {
    const shown = medals ?? [];
    setMedals(null);
    void clearUnseen(shown.map((m) => m.eventId));
    if (goToMedals) navigate("/stats/achievements?tab=medals");
  }

  return (
    <div className={styles.revealBackdrop} data-reduced={reduced || undefined}>
      <div
        className={styles.revealPanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="medal-reveal-title"
        style={medalBackgroundVars(first.medalColorId, first.medalStyleId)}
      >
        {!reduced && <Confetti pieces={36} durationMs={3800} />}
        <div className={styles.revealMedals}>
          {medals.slice(0, 3).map((m, i) => (
            <MedalBadge
              key={m.eventId}
              size={i === 0 ? 150 : 96}
              shine={!reduced}
              className={`${styles.revealMedal} ${i > 0 ? styles.revealMedalBack : ""}`}
            />
          ))}
        </div>
        <h2 id="medal-reveal-title" className={styles.revealTitle}>
          {many ? `${medals.length} new medals!` : "You earned a medal!"}
        </h2>
        <p className={styles.revealEvent} dir={detectTextDirection(first.eventTitle)}>
          {first.eventTitle}
          <span className={styles.revealDate}> · {formatMedalDate(first.eventDate)}</span>
        </p>
        <p className={styles.revealText} dir={detectTextDirection(first.medalText)}>
          {first.medalText}
        </p>
        <div className={styles.revealActions}>
          <button type="button" className="button" onClick={() => void close(true)}>
            See my medals
          </button>
          <button
            type="button"
            ref={closeRef}
            className="button button--quiet"
            onClick={() => void close()}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
