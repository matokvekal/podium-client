/**
 * Hand-drawn bike icons for the DISTANCE stat, one per kind of riding.
 *
 * Asked for directly: the distance stat on the ride card and the ride page used a generic
 * `Ruler`, which says "a length" and nothing about the ride. A rider scanning a list wants to
 * see at a glance whether the kilometres in front of them are road kilometres or trail
 * kilometres, so the number now carries the bike it belongs to.
 *
 * These are drawn here rather than imported because lucide-react ships ONE bike (`Bike`) — it
 * cannot tell a road bike from an MTB, and that distinction is the whole point. They are drawn
 * to lucide's own grid so they sit correctly next to `Mountain`/`Timer` in the same stat strip:
 * 24x24 box, no fill, `currentColor` stroke, round caps and joins.
 *
 * The three share one frame (rear triangle, top tube, down tube) and differ only where a real
 * bike differs, which is what makes them readable at 14px:
 *
 *   road    thin tyres (1.5 stroke), big wheels, DROP bar hooking down past the head tube
 *   gravel  the same drop bar, fatter tyres (2.0) — a road bike that can leave the tarmac
 *   mtb     fat tyres (2.6), flat riser bar, and a kinked SUSPENSION fork
 *
 * Running and hiking keep the ruler: their distance is not ridden. See `DISTANCE_ICON`.
 */

import { Ruler } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import type { SurfaceType } from "../lib/surface-types";

type IconProps = SVGProps<SVGSVGElement> & { size?: number | string };

/** The props every call site actually passes. Wide enough to hold both a lucide icon (which is
 *  a forwardRef component) and the plain function components below, so the two are
 *  interchangeable in the same slot. */
export type DistanceIcon = ComponentType<{
  className?: string;
  width?: number | string;
  height?: number | string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

/** Same attribute set lucide-react puts on every icon, so these inherit colour and size from
 *  the surrounding CSS exactly the way `<Ruler className={styles.statIcon} />` did. */
function Icon({ size = 24, width, height, children, ...rest }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={width ?? size}
      height={height ?? size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      // Decorative by default: every one of these sits beside the distance it labels, and the
      // number is the accessible content. A caller that wants it announced passes its own
      // aria-label/role through {...rest}.
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

/**
 * The frame every one of the three shares: rear triangle, sloping top tube, down tube, and a
 * seatpost carrying the saddle. Hubs sit on y=15 and the ink spans roughly y 5.5–19, so the
 * bike is centred in the 24-box the way the lucide icons beside it are — drawn any lower it
 * reads as sagging next to `Mountain` and `Timer` in the same stat strip.
 */
const FRAME = (
  <>
    {/* seat tube + the post above it */}
    <path d="M9.4 6.2 11.4 15" />
    {/* seat stay, meeting the seat tube where the top tube does */}
    <path d="M5.4 15 9.9 8.2" />
    {/* chainstay */}
    <path d="M11.4 15H5.4" />
    {/* top tube, sloping down to the head tube */}
    <path d="M9.9 8.2 16 7" />
    {/* down tube */}
    <path d="M16 7 11.4 15" />
    {/* saddle */}
    <path d="M8.3 6.2h2.2" />
  </>
);

export function RoadBikeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      {/* thin tyres — the whole difference between this and the MTB at 13px is stroke weight
          and what is happening at the handlebar */}
      <circle cx="5.4" cy="15" r="3.5" strokeWidth={1.5} />
      <circle cx="18.6" cy="15" r="3.5" strokeWidth={1.5} />
      {FRAME}
      {/* fork: straight, raked forward to the hub */}
      <path d="M16 7 18.6 15" />
      {/* stem, then the drop bar hooking forward and down */}
      <path d="M16 7 16.5 5.6" />
      <path d="M15.2 5.6h2.1a1.4 1.4 0 0 1 .2 2.4" />
    </Icon>
  );
}

export function GravelBikeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      {/* a road bike that can leave the tarmac: same drop bar, fatter tyres */}
      <circle cx="5.4" cy="15" r="3.4" strokeWidth={2} />
      <circle cx="18.6" cy="15" r="3.4" strokeWidth={2} />
      {FRAME}
      <path d="M16 7 18.6 15" />
      <path d="M16 7 16.5 5.6" />
      <path d="M15.2 5.6h2.1a1.4 1.4 0 0 1 .2 2.4" />
    </Icon>
  );
}

export function MtbBikeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      {/* fat tyres */}
      <circle cx="5.4" cy="15" r="3.2" strokeWidth={2.4} />
      <circle cx="18.6" cy="15" r="3.2" strokeWidth={2.4} />
      {FRAME}
      {/* suspension fork: crown, then the stanchion kinked forward to the hub */}
      <path d="M16 7 17.1 10 18.6 15" />
      {/* stem, then a flat bar sweeping up at the grip */}
      <path d="M16 7 16.3 6" />
      <path d="M15 6h1.9l1-.7" />
    </Icon>
  );
}

/** Which icon labels a ride's DISTANCE, by what the ride is.
 *  Running and hiking distance is walked, not ridden — a bike there would be a lie, so they
 *  keep the ruler, and so does a ride whose organizer never set an activity type. */
export const DISTANCE_ICON: Record<SurfaceType, DistanceIcon> = {
  road: RoadBikeIcon,
  gravel: GravelBikeIcon,
  mtb: MtbBikeIcon,
  running: Ruler,
  hiking: Ruler,
};

export function distanceIconFor(activityType: SurfaceType | null | undefined): DistanceIcon {
  return activityType ? DISTANCE_ICON[activityType] : Ruler;
}
