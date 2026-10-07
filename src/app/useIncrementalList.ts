import { useEffect, useMemo, useState } from "react";

/**
 * Draws a long list a page at a time: `pageSize` items first, the next page each time the
 * sentinel (put `sentinelRef` on an element after the last item) scrolls near the viewport.
 * The data is already on the device — this only widens the slice that is rendered, it never
 * fetches. Same IntersectionObserver-over-a-sentinel pattern as StatisticsAchievementsPage.
 *
 * `resetKey` is whatever selects the list (filter chips, search, sort): when it changes the
 * list starts again from the first page, so a new filter never opens scrolled 200 rows deep.
 */
export function useIncrementalList<T>(items: T[], resetKey: string, pageSize = 20) {
  const [count, setCount] = useState(pageSize);
  // Reset during render (not in an effect) so the new filter's first paint is already the
  // first page, with no flash of the old, longer slice.
  const [key, setKey] = useState(resetKey);
  if (key !== resetKey) {
    setKey(resetKey);
    setCount(pageSize);
  }

  const visible = useMemo(() => items.slice(0, count), [items, count]);
  const hasMore = count < items.length;
  // A callback ref, not useRef: the sentinel can mount long after this hook (My Rides keeps the
  // hook alive while See All is closed), and only state tells the effect below it has appeared.
  const [sentinel, sentinelRef] = useState<HTMLDivElement | null>(null);

  // Re-attached after every page (`count` in the deps): an observer only reports CHANGES, so a
  // sentinel still on screen after a short page would otherwise never ask for the next one.
  useEffect(() => {
    if (!sentinel || !hasMore || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setCount((c) => c + pageSize);
      },
      { rootMargin: "400px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel, hasMore, count, pageSize]);

  return { visible, hasMore, sentinelRef, total: items.length };
}
