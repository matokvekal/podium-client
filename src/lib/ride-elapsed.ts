// The live screen's "Elapsed" clock (pages/LiveEventPage.tsx).
//
// It used to be `now - startsAt` — the PLANNED start. A ride started early read 00:00:00 until
// the planned time; one started late counted the minutes everyone stood around waiting. The
// server now records when the ride ACTUALLY went live (events.started_at, sql/048), and that is
// what this counts from.
//
// Fallbacks, for rides that went live before the server recorded it:
//   planned start in the past   → count from the planned start (the old behaviour)
//   planned start in the future → null: the ride is clearly running already, and a frozen
//                                 00:00:00 is a wrong answer, so the box is hidden instead
// A finished ride stops at its finish time rather than counting on forever.

export function rideElapsedMs(
  ride: { startedAt?: string | null; startsAt: string | null; finishedAt?: string | null },
  now: number,
): number | null {
  const parse = (iso: string | null | undefined) => {
    if (!iso) return null;
    const t = Date.parse(iso);
    return Number.isNaN(t) ? null : t;
  };
  const started = parse(ride.startedAt);
  const planned = parse(ride.startsAt);
  const start = started ?? (planned != null && planned <= now ? planned : null);
  if (start == null) return null;
  const end = parse(ride.finishedAt) ?? now;
  return Math.max(0, end - start);
}
