// Shared Leaflet marker icons for RouteMap.tsx and TrackMap.tsx — a small triangle inside the
// start circle pointing the way the route goes, a flag for the finish, and a few sparse
// direction arrows along the line so the ride's direction reads at a glance without needing to
// tap Start first. Asked for directly: "best ui ux not to bif [big]" — kept deliberately small
// and sparse (directionArrowIndices caps it at 3 arrows, skipped on short routes) rather than
// arrows on every segment.

import L from "leaflet";

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Compass bearing in degrees (0 = north, clockwise) from one point to the next. */
export function bearingDeg(from: [number, number], to: [number, number]): number {
  const phi1 = toRad(from[0]);
  const phi2 = toRad(to[0]);
  const deltaLambda = toRad(to[1] - from[1]);
  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** A handful of evenly-spaced indices to place direction arrows at — empty for a route too
 * short to need them, capped at 3 so a busy multi-track map never gets cluttered. */
export function directionArrowIndices(pointCount: number): number[] {
  if (pointCount < 6) return [];
  return [0.25, 0.5, 0.75]
    .map((f) => Math.round(f * (pointCount - 1)))
    .filter((i) => i > 0 && i < pointCount - 1);
}

/** Evenly-spaced indices for the direction chevrons along the LIVE route — denser than
 * directionArrowIndices (that one is for the small static preview map), still capped so a
 * long route never spawns hundreds of markers. */
export function routeArrowIndices(pointCount: number, count = 9): number[] {
  if (pointCount < 4) return [];
  const out = new Set<number>();
  for (let k = 1; k <= count; k++) {
    const i = Math.round((k / (count + 1)) * (pointCount - 1));
    if (i > 0 && i < pointCount - 1) out.add(i);
  }
  return [...out];
}

export function startIcon(headingDeg: number, color = "#3edda4"): L.DivIcon {
  return L.divIcon({
    className: "podium-map-icon",
    html: `<div style="width:22px;height:22px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;">
      <svg width="10" height="10" viewBox="0 0 10 10" style="transform:rotate(${headingDeg}deg)">
        <polygon points="5,0 10,10 0,10" fill="#fff" />
      </svg>
    </div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

export function finishIcon(color = "#df4b7b"): L.DivIcon {
  return L.divIcon({
    className: "podium-map-icon",
    html: `<div style="width:22px;height:22px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:11px;line-height:1;">🏁</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

export function directionArrowIcon(headingDeg: number, color = "#63a6fc"): L.DivIcon {
  return L.divIcon({
    className: "podium-map-icon",
    html: `<svg width="13" height="13" viewBox="0 0 14 14" style="transform:rotate(${headingDeg}deg);filter:drop-shadow(0 0 1px rgba(0,0,0,.5));">
      <polygon points="7,1 13,12 1,12" fill="${color}" />
    </svg>`,
    iconSize: [13, 13],
    iconAnchor: [6, 6],
  });
}

/** Small direction chevrons dropped along the live route so the way it runs reads at a glance
 * on both the day and dark map — a visible amber, dark-outlined so it never sinks into either
 * background. Kept small on purpose (asked for directly: "arows smals ... seen color"). */
export function routeDirectionArrowIcon(headingDeg: number): L.DivIcon {
  return L.divIcon({
    className: "podium-map-icon",
    html: `<svg width="15" height="15" viewBox="0 0 16 16" style="transform:rotate(${headingDeg}deg);filter:drop-shadow(0 0 1.5px rgba(0,0,0,.85));">
      <path d="M8 1.5 L14 14 L8 10.5 L2 14 Z" fill="#ffd23f" stroke="#1a1a1a" stroke-width="1" stroke-linejoin="round" />
    </svg>`,
    iconSize: [15, 15],
    iconAnchor: [7.5, 7.5],
  });
}

/** Live-map rider marker: a small square (same "3x3px square" visual language as
 * SplashScreen's rider dots — see splash-screen.css) with an optional direction arrow, sized
 * up and outlined when selected from the rider list below the map. `stale` (no update within
 * config.staleAfterMs) dims it rather than hiding it — still real, just not fresh. */
export function riderSquareIcon(
  headingDeg: number | null,
  opts: { color?: string; stale?: boolean; selected?: boolean } = {},
): L.DivIcon {
  const color = opts.color ?? "#fb923c";
  const size = opts.selected ? 14 : 9;
  const arrow =
    headingDeg != null
      ? `<div style="position:absolute;top:-5px;left:50%;width:0;height:0;border-left:3px solid transparent;border-right:3px solid transparent;border-bottom:5px solid ${color};transform-origin:50% 7px;transform:translateX(-50%) rotate(${headingDeg}deg);"></div>`
      : "";
  return L.divIcon({
    className: "podium-map-icon",
    html: `<div style="position:relative;width:${size}px;height:${size}px;opacity:${opts.stale ? 0.4 : 1};">
      <div style="width:100%;height:100%;background:${color};border-radius:2px;box-shadow:0 0 4px ${color}${opts.selected ? ";outline:2px solid #fff" : ""};"></div>
      ${arrow}
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/**
 * The viewer's own device position — a distinct blue "you are here" marker, never confused
 * with a rider square or the red SOS marker. Shown while this rider is sharing location; that
 * sharing now also transmits to the server (app/useLocationBroadcast.ts) — see
 * ELNINO_CLIENT_AGENT_SOURCE_OF_TRUTH.md §14.
 *
 * With a known heading it is a Google-/Waze-style navigation arrow (a chevron pointing the way
 * the rider is moving) sitting in a soft accuracy halo; with no heading yet — first fix, or
 * standing still — it falls back to the classic pulsing dot so it never points a made-up way.
 */
export function selfPositionIcon(headingDeg: number | null = null): L.DivIcon {
  const halo = `<div style="position:absolute;inset:0;border-radius:50%;background:rgba(66,133,244,.18);box-shadow:0 0 0 3px rgba(66,133,244,.12);"></div>`;

  const core =
    headingDeg != null
      ? `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(${headingDeg}deg);transform-origin:50% 50%;">
          <svg width="26" height="26" viewBox="0 0 26 26" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.4));">
            <path d="M13 2 L20.5 21 L13 16.5 L5.5 21 Z" fill="#4285f4" stroke="#fff" stroke-width="1.6" stroke-linejoin="round" />
          </svg>
        </div>`
      : `<div style="position:absolute;top:50%;left:50%;width:14px;height:14px;transform:translate(-50%,-50%);border-radius:50%;background:#4285f4;border:2px solid #fff;box-shadow:0 0 0 4px rgba(66,133,244,.35);"></div>`;

  return L.divIcon({
    className: "podium-map-icon",
    html: `<div style="position:relative;width:30px;height:30px;">${halo}${core}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

export function restStopIcon(color = "#3edda4"): L.DivIcon {
  return L.divIcon({
    className: "podium-map-icon",
    html: `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:10px;line-height:1;">☕</div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}
