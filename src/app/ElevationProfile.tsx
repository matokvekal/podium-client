// The elevation profile drawn directly under a route map — a standard cycling climb chart:
// a continuous line with the area beneath it filled, real cumulative distance in km across the
// bottom, metres up the side, and a subtle grid behind.
//
// Hand-rolled inline SVG rather than a charting library, for the same reason
// app/track-thumbnail.ts draws its own polyline: this is a single monotone series, the repo
// carries no chart dependency, and Leaflet is already the one heavy thing in the bundle.
//
// It knows nothing about GPX files, events or APIs. It takes a route's points and the parallel
// elevation series and draws them; lib/elevation-profile.ts does the geometry and decides
// whether there is anything honest to draw at all.
//
// WHEN THERE IS NO USABLE ELEVATION THIS RENDERS NOTHING. A route without elevation is an
// ordinary route — the map above it carries on exactly as before, and no empty axes appear.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildElevationProfile,
  distanceTicks,
  type ElevationSample,
  elevationAxis,
} from "../lib/elevation-profile";
import styles from "./ElevationProfile.module.css";

interface ElevationProfileProps {
  /** [lat, lng] pairs — the same array the map above is drawing. */
  points: readonly [number, number][] | null | undefined;
  /** One entry per point, null where that point had no reading. Null/undefined = no profile. */
  elevations: readonly (number | null)[] | null | undefined;
  /** Overrides the responsive default (96px on a phone, 120px on a wide screen). */
  heightPx?: number;
}

/** Room for the "1200 m" gutter, the km labels underneath, and a little air top and right. */
const PAD_LEFT = 42;
const PAD_RIGHT = 14;
const PAD_TOP = 8;
const PAD_BOTTOM = 16;

/** Until the container has been measured. Replaced on the first ResizeObserver callback. */
const FALLBACK_WIDTH = 360;
const WIDE_SCREEN_PX = 600;

function formatKm(km: number): string {
  // 0.5 km matters on a short route; the decimal is noise on a 40 km one.
  return km >= 10 || Number.isInteger(km) ? `${Math.round(km)}` : `${km.toFixed(1)}`;
}

/** The sample nearest a distance, by binary search — the series is sorted by distance. */
function sampleNearest(samples: readonly ElevationSample[], km: number): ElevationSample {
  let low = 0;
  let high = samples.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (samples[mid].distanceKm < km) low = mid + 1;
    else high = mid;
  }
  const after = samples[low];
  const before = samples[low > 0 ? low - 1 : 0];
  return Math.abs(before.distanceKm - km) <= Math.abs(after.distanceKm - km) ? before : after;
}

export function ElevationProfile({ points, elevations, heightPx }: ElevationProfileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  const [hover, setHover] = useState<ElevationSample | null>(null);

  // Measured rather than scaled with a viewBox: stretching a viewBox to fit would distort the
  // axis text along with the line, and this has to stay legible from 320px to a desktop.
  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width ?? 0;
      if (measured > 0) setWidth(measured);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const profile = useMemo(() => buildElevationProfile(points, elevations), [points, elevations]);

  const height = heightPx ?? (width >= WIDE_SCREEN_PX ? 120 : 96);
  const plotWidth = Math.max(1, width - PAD_LEFT - PAD_RIGHT);
  const plotHeight = Math.max(1, height - PAD_TOP - PAD_BOTTOM);
  const baseline = PAD_TOP + plotHeight;

  const axis = useMemo(() => (profile ? elevationAxis(profile) : null), [profile]);

  const geometry = useMemo(() => {
    if (!profile || !axis) return null;

    const span = axis.maxM - axis.minM || 1;
    const toX = (km: number) => PAD_LEFT + (km / profile.totalKm) * plotWidth;
    const toY = (m: number) => PAD_TOP + (1 - (m - axis.minM) / span) * plotHeight;

    const line = profile.samples
      .map(
        (s, i) =>
          `${i === 0 ? "M" : "L"}${toX(s.distanceKm).toFixed(1)} ${toY(s.elevationM).toFixed(1)}`,
      )
      .join(" ");
    const first = profile.samples[0];
    const last = profile.samples[profile.samples.length - 1];
    const area = `${line} L${toX(last.distanceKm).toFixed(1)} ${baseline} L${toX(first.distanceKm).toFixed(1)} ${baseline} Z`;

    return { toX, toY, line, area };
  }, [profile, axis, plotWidth, plotHeight, baseline]);

  const trackPointer = useCallback(
    (clientX: number) => {
      const element = containerRef.current;
      if (!element || !profile) return;
      const bounds = element.getBoundingClientRect();
      const ratio = (clientX - bounds.left - PAD_LEFT) / plotWidth;
      const km = Math.min(1, Math.max(0, ratio)) * profile.totalKm;
      setHover(sampleNearest(profile.samples, km));
    },
    [profile, plotWidth],
  );

  // Nothing usable to draw: the page carries on with just its map.
  if (!profile || !axis || !geometry) return null;

  const climbLabel = `${Math.round(profile.maxM - profile.minM)} m between the lowest and highest point`;

  return (
    <div
      ref={containerRef}
      className={styles.wrap}
      onPointerMove={(e) => trackPointer(e.clientX)}
      onPointerDown={(e) => trackPointer(e.clientX)}
      onPointerLeave={() => setHover(null)}
      onPointerCancel={() => setHover(null)}
    >
      <svg
        className={styles.chart}
        width={width}
        height={height}
        role="img"
        aria-label={`Elevation profile over ${formatKm(profile.totalKm)} km, ${climbLabel}.`}
      >
        <g>
          {axis.ticks.map((tick) => {
            const y = geometry.toY(tick);
            return (
              <g key={`y${tick}`}>
                <line className={styles.grid} x1={PAD_LEFT} x2={width - PAD_RIGHT} y1={y} y2={y} />
                <text className={styles.label} x={PAD_LEFT - 6} y={y} textAnchor="end">
                  {Math.round(tick)} m
                </text>
              </g>
            );
          })}

          {distanceTicks(profile.totalKm).map((tick, i, all) => {
            const x = geometry.toX(tick);
            // The end labels are pulled inwards so neither is clipped by the chart edge.
            const anchor = i === 0 ? "start" : i === all.length - 1 ? "end" : "middle";
            return (
              <g key={`x${tick}`}>
                <line className={styles.grid} x1={x} x2={x} y1={PAD_TOP} y2={baseline} />
                <text
                  className={styles.label}
                  x={x}
                  y={height - 4}
                  textAnchor={anchor}
                  dominantBaseline="auto"
                >
                  {formatKm(tick)} km
                </text>
              </g>
            );
          })}
        </g>

        <path className={styles.area} d={geometry.area} />
        <path className={styles.line} d={geometry.line} />

        {hover && (
          <g>
            <line
              className={styles.cursor}
              x1={geometry.toX(hover.distanceKm)}
              x2={geometry.toX(hover.distanceKm)}
              y1={PAD_TOP}
              y2={baseline}
            />
            <circle
              className={styles.cursorDot}
              cx={geometry.toX(hover.distanceKm)}
              cy={geometry.toY(hover.elevationM)}
              r={3}
            />
          </g>
        )}
      </svg>

      {hover && (
        <p className={styles.readout}>
          {hover.distanceKm.toFixed(1)} km · {Math.round(hover.elevationM)} m
        </p>
      )}
    </div>
  );
}

export default ElevationProfile;
