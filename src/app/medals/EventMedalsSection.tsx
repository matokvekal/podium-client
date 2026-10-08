// Statistics → Achievements → "Medals": the rider's Event Completion Medals, newest first, paged
// from the server as the rider scrolls (same IntersectionObserver-over-a-sentinel pattern as the
// rest of this page). Self-contained: if medals fail to load, only this section says so — the
// Month/Year results are untouched.
//
// Opening the section marks the medals it shows as seen, which clears the "New" tag. A deep link
// (?medal=<eventId>, from a Past Ride's 🏅) scrolls to that medal and celebrates it.

import { useEffect, useMemo, useRef } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useMedalsStore } from "../../store/medalsStore";
import { MedalBadge } from "./MedalBadge";
import { MedalCard } from "./MedalCard";
import styles from "./Medals.module.css";
import { useClearUnseenMedals } from "./useClearUnseenMedals";

/** How many extra pages a deep link may fetch looking for its medal before giving up. */
const DEEP_LINK_MAX_PAGES = 5;

export function EventMedalsSection({ highlightEventId }: { highlightEventId?: string | null }) {
  const { profile } = useAuth();
  const userId = profile?.id ?? null;
  const medals = useMedalsStore((s) => s.medals);
  const total = useMedalsStore((s) => s.total);
  const loading = useMedalsStore((s) => s.loading);
  const failed = useMedalsStore((s) => s.failed);
  const nextCursor = useMedalsStore((s) => s.nextCursor);
  const loadFirst = useMedalsStore((s) => s.loadFirst);
  const loadMore = useMedalsStore((s) => s.loadMore);
  const clearUnseen = useClearUnseenMedals();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLElement | null>(null);
  const scrolledRef = useRef(false);
  const deepLinkPagesRef = useRef(0);

  useEffect(() => {
    if (userId != null) void loadFirst(userId);
  }, [userId, loadFirst]);

  // Seen = shown in this section. Each unseen medal is sent once (markedRef), a moment after it
  // appears; its NEW ribbon stays for the rest of this visit — the store never flips `seen`
  // locally — and is gone on the next one, on every device.
  const markedRef = useRef(new Set<string>());
  const toMark = useMemo(
    () => medals.filter((m) => !m.seen && !markedRef.current.has(m.eventId)).map((m) => m.eventId),
    [medals],
  );
  useEffect(() => {
    if (toMark.length === 0) return;
    const t = setTimeout(() => {
      for (const id of toMark) markedRef.current.add(id);
      void clearUnseen(toMark);
    }, 1500);
    return () => clearTimeout(t);
  }, [toMark, clearUnseen]);

  // Deep link: keep paging until the medal is loaded (bounded), then scroll to it once.
  const found = highlightEventId ? medals.some((m) => m.eventId === highlightEventId) : false;
  useEffect(() => {
    if (!highlightEventId || found || loading || !nextCursor) return;
    if (deepLinkPagesRef.current >= DEEP_LINK_MAX_PAGES) return;
    deepLinkPagesRef.current += 1;
    void loadMore();
  }, [highlightEventId, found, loading, nextCursor, loadMore]);
  useEffect(() => {
    if (!found || scrolledRef.current) return;
    scrolledRef.current = true;
    highlightRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [found]);

  // Infinite scroll.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !nextCursor || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "400px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [nextCursor, loadMore]);

  if (failed && medals.length === 0) {
    return (
      <p className={styles.note} role="alert">
        Couldn't load your medals right now.{" "}
        <button
          type="button"
          className={styles.noteButton}
          onClick={() => userId != null && void loadFirst(userId)}
        >
          Try again
        </button>
      </p>
    );
  }

  if (loading && medals.length === 0) {
    return (
      <p className={styles.note} role="status">
        Loading your medals…
      </p>
    );
  }

  if (medals.length === 0) {
    return (
      <div className={styles.emptyMedals}>
        <MedalBadge size={88} muted />
        <p className={styles.emptyTitle}>No medals yet</p>
        <p className={styles.emptyHint}>
          Ride in an event that gives a completion medal and it will land here when the ride is
          finished.
        </p>
      </div>
    );
  }

  return (
    <section className={styles.medalsSection} aria-label="Event medals">
      <p className={styles.medalsCount}>
        <span aria-hidden="true">🏅</span> {total > 0 ? total : medals.length}{" "}
        {(total > 0 ? total : medals.length) === 1 ? "Event Medal" : "Event Medals"}
      </p>
      <div className={styles.medalGrid}>
        {medals.map((medal, i) => {
          const isHighlight = medal.eventId === highlightEventId;
          return (
            <MedalCard
              key={medal.eventId}
              medal={medal}
              index={i}
              highlighted={isHighlight}
              ref={isHighlight ? highlightRef : undefined}
            />
          );
        })}
      </div>
      {loading && <p className={styles.note}>Loading more…</p>}
      <div ref={sentinelRef} aria-hidden="true" />
    </section>
  );
}
