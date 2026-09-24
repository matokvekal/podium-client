// Wind (and temperature) around the ride, drawn directly under the elevation profile as a compact
// data grid. One column per forecast hour, from an hour before the planned start to an hour after
// the planned end:
//
//         05:30  06:30  07:30  08:30        time, tiny
//   km/h  [ 6 ]  [ 7 ]  [13 ]  [10 ]        speed INSIDE a small rectangular cell (fill = strength)
//           ↖      →      →      ↗          direction arrow directly BELOW the cell
//   gust                  21     18         plain small text, ONLY where the gust is significant
//   °C     18°    18°    19°    20°         plain text, one row, smaller and quieter than the wind
//
// ALIGNMENT. The grid occupies exactly the elevation chart's plot area — the same left gutter (for
// the row labels, like the chart's own metres labels) and the same right margin — so it reads as
// the chart's next row rather than a separate card. The chart's x-axis is DISTANCE, though, and we
// deliberately do not convert time to distance (no ETA, no rider position): the hourly columns are
// spread evenly across that plot width, in time order.
//
// Open to every viewer of a ride that has a route and a start time. Any failure on the way (no
// route, no start time, forecast out of range, provider down, storage blocked) renders nothing
// and asks for nothing more: a weather problem must never take the ride page with it.
//
// The arrow is north-up like a weather map — a wind from the west (270°) points east.

import { useMemo } from "react";
import { estimateDurationMin } from "../lib/ride-duration";
import { formatLocalClockParts } from "../lib/time";
import { weatherCodeInfo, weatherIcon } from "../lib/weather-codes";
import { type WindLabels, windLabels, windLanguage } from "../lib/wind-labels";
import { showGust, type WindSample, windCellColors, windStrength } from "../lib/wind-model";
import { useCountryStore } from "../store/countryStore";
import { useWindForecast } from "./useWindForecast";
import styles from "./WindStrip.module.css";

interface WindStripProps {
  event: { id: string; startsAt: string | null };
  /** [lat, lng] pairs — the route the elevation profile above is drawing. */
  points: readonly [number, number][] | null | undefined;
  /** The ride's duration as the page resolved it: the organizer's figure, else the estimate. */
  durationMin: number | null | undefined;
  /** The route's own length, for the last-resort duration estimate. */
  routeDistanceKm: number | null | undefined;
}

/** A thin arrow, muted: a data mark under the cell, not a control. */
function WindArrow({ towardsDeg }: { towardsDeg: number }) {
  return (
    <svg
      className={styles.arrow}
      viewBox="0 0 24 24"
      width={12}
      height={12}
      aria-hidden="true"
      style={{ transform: `rotate(${towardsDeg}deg)` }}
    >
      <path
        d="M12 20V5M6.5 10.5 12 5l5.5 5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WindColumn({
  sample,
  labels,
  gustRow,
}: {
  sample: WindSample;
  labels: WindLabels;
  gustRow: boolean;
}) {
  const level = windStrength(sample.speedKmh);
  const speed = Math.round(sample.speedKmh);
  const gust = showGust(sample.speedKmh, sample.gustKmh) ? Math.round(sample.gustKmh) : null;
  const clock = formatLocalClockParts(new Date(sample.timeMs));
  const sky = weatherCodeInfo(sample.weatherCode);
  const description = [
    [clock?.time, clock?.suffix].filter(Boolean).join(" "),
    sample.weatherCode != null ? sky.label : null,
    `${labels.strength[level]} ${speed} ${labels.unit}`,
    `${labels.from} ${Math.round(sample.directionDeg)}°`,
    gust != null ? `${labels.gust} ${gust}` : null,
    sample.temperatureC != null ? `${Math.round(sample.temperatureC)}°C` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <li className={styles.col} title={description} aria-label={description}>
      <span className={styles.time}>{clock?.time ?? "—"}</span>
      <span className={styles.icon} aria-hidden="true">
        {sample.weatherCode != null ? weatherIcon(sample.weatherCode, sample.isDay) : ""}
      </span>
      <span className={styles.cell} style={windCellColors(sample.speedKmh)}>
        {speed}
      </span>
      <span className={styles.arrowRow}>
        <WindArrow towardsDeg={(sample.directionDeg + 180) % 360} />
      </span>
      {/* Plain text, no box — and nothing at all for an hour without a notable gust. */}
      {gustRow && <span className={`${styles.text} ${styles.gust}`}>{gust ?? ""}</span>}
      {/* Secondary: smaller and quieter than the wind, with its degree sign ("19°"); the unit
          itself is printed once, in the left gutter. */}
      <span className={`${styles.text} ${styles.temp}`}>
        {sample.temperatureC != null ? `${Math.round(sample.temperatureC)}°` : ""}
      </span>
    </li>
  );
}

export function WindStrip({ event, points, durationMin, routeDistanceKm }: WindStripProps) {
  const country = useCountryStore((s) => s.code);

  // The smallest sensible fallback when the ride has neither a stated nor an estimated duration:
  // the app's own estimate from the route's length alone (a generic 20 km/h bike ride).
  const resolvedDurationMin = useMemo(
    () =>
      durationMin ??
      estimateDurationMin({
        distanceKm: routeDistanceKm,
        climbM: null,
        activityType: null,
        terrainGrade: null,
        level: null,
        restStops: null,
      }),
    [durationMin, routeDistanceKm],
  );

  const forecast = useWindForecast({
    eventId: event.id,
    points,
    startsAt: event.startsAt,
    durationMin: resolvedDurationMin,
  });

  const language = windLanguage(country);
  const labels = windLabels(language);

  if (!forecast) return null;

  // The gust row exists only if at least one hour has a gust worth showing; otherwise it would
  // be a row of blanks.
  const gustRow = forecast.samples.some((s) => showGust(s.speedKmh, s.gustKmh));

  return (
    // The time axis always runs left to right, like the elevation chart above it.
    <section className={styles.wrap} dir="ltr" lang={language}>
      {/* Row labels sit in the chart's left gutter and stay put while the columns scroll. */}
      <div className={styles.labels} aria-hidden="true">
        <span className={styles.time}>&nbsp;</span>
        <span className={styles.icon}>&nbsp;</span>
        <span className={styles.rowLabelCell}>{labels.unit}</span>
        <span className={styles.arrowRow} />
        {gustRow && <span className={styles.rowLabelText}>{labels.gust}</span>}
        <span className={`${styles.rowLabelText} ${styles.temp}`}>°C</span>
      </div>
      <ol className={styles.strip}>
        {forecast.samples.map((sample) => (
          <WindColumn key={sample.timeMs} sample={sample} labels={labels} gustRow={gustRow} />
        ))}
      </ol>
      {/* Open-Meteo's CC BY 4.0 licence requires attribution; kept to one tiny credit. */}
      <a
        className={styles.credit}
        href="https://open-meteo.com/"
        target="_blank"
        rel="noreferrer noopener"
      >
        Open-Meteo
      </a>
    </section>
  );
}

export default WindStrip;
