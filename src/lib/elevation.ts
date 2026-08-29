// Total elevation gain (cumulative climb, in metres) from a series of point elevations —
// used by the GPX and CSV track parsers. "Elevation gain" is the sum of every uphill section,
// which is NOT `max - min`: a rolling route that ends where it started still has real climb.
//
// GPS/barometric elevation is noisy (±1–3 m of jitter between adjacent points is normal), so a
// naive sum of positive deltas roughly doubles the real figure. This uses the standard fix — a
// hysteresis threshold: a climb only counts once it clears NOISE_THRESHOLD_M above the last
// low point, and a new low resets where the next climb is measured from. Small wiggles are
// ignored.
//
// Returns null when there is nothing to measure (no elevation data, or fewer than two usable
// samples) — the caller then leaves elevation unset rather than inventing a number.

const NOISE_THRESHOLD_M = 5;

export function elevationGainFromSeries(
  values: readonly (number | null | undefined)[],
): number | null {
  const series = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (series.length < 2) return null;

  let gain = 0;
  // The elevation we are currently measuring the next climb from — the most recent confirmed
  // top (after banking a climb) or bottom (after a descent).
  let anchor = series[0];

  for (let i = 1; i < series.length; i++) {
    const delta = series[i] - anchor;
    if (delta >= NOISE_THRESHOLD_M) {
      gain += delta;
      anchor = series[i];
    } else if (delta < 0) {
      anchor = series[i];
    }
  }

  return Math.round(gain);
}
