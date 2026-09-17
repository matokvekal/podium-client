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
 * The three share one frame (rear triangle, top tube, down tube) and differ where a real bike
 * differs. THE TELL IS BAR HEIGHT, not tyre width: stroke weight alone is nearly invisible at
 * 14px, but where the rider's hands sit relative to the saddle is the silhouette everyone
 * already knows.
 *
 *   road    hands BELOW the saddle — a deep drop hooking down past the head tube, the racing
 *           crouch. Big thin wheels (1.2 stroke) on a straight steep fork.
 *   gravel  the same drop bar but level with the saddle, endurance height, on fatter tyres —
 *           a road bike that can leave the tarmac.
 *   mtb     hands ABOVE the saddle — a wide flat riser bar, upright. Fat tyres (2.8) and a
 *           real TELESCOPIC fork: a crown across the top with the stanchion dropping out of
 *           it, not just a bent line.
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
      {/* big, thin, fast — the largest wheels of the three on the lightest stroke */}
      <circle cx="5.4" cy="15" r="3.8" strokeWidth={1.2} />
      <circle cx="18.6" cy="15" r="3.8" strokeWidth={1.2} />
      {FRAME}
      {/* fork: straight and steep, no rake to speak of */}
      <path d="M16 7 18.6 15" />
      {/* THE RACING CROUCH. Short stem angled down, then a deep drop curling forward and under
          to finish BELOW the saddle (y 6.2). That inversion — hands lower than the seat — is
          what makes this read as a race bike and not merely a bike with thin tyres. */}
      <path d="M16 7 16.6 7.1" />
      <path d="M15.4 7.1h2.2a1.5 1.5 0 0 1 .1 2.7" />
    </Icon>
  );
}

export function GravelBikeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      {/* a road bike that can leave the tarmac: drop bar still, fatter tyres */}
      <circle cx="5.4" cy="15" r="3.5" strokeWidth={2} />
      <circle cx="18.6" cy="15" r="3.5" strokeWidth={2} />
      {FRAME}
      <path d="M16 7 18.6 15" />
      {/* Endurance height: the drop sits LEVEL with the saddle rather than under it — between
          the road bike's crouch and the MTB's upright bar, which is exactly where gravel is. */}
      <path d="M16 7 16.5 6.2" />
      <path d="M15.3 6.2h2.2a1.4 1.4 0 0 1 .1 2.4" />
    </Icon>
  );
}

export function MtbBikeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      {/* the fattest tyres of the three, on the smallest rims — chunky rather than fast */}
      <circle cx="5.4" cy="15" r="3.1" strokeWidth={2.8} />
      <circle cx="18.6" cy="15" r="3.1" strokeWidth={2.8} />
      {FRAME}
      {/* A REAL TELESCOPIC FORK, drawn as three strokes instead of one bent line: the crown
          across the top, the short steerer into it, and the stanchion sliding out of it down
          to the hub. Suspension is the thing that says mountain bike, so it is drawn as the
          mechanism rather than implied by a kink. */}
      <path d="M14.8 8.7h2.6" />
      <path d="M16 7 16 8.7" />
      <path d="M17.2 8.7 18.6 15" />
      {/* UPRIGHT. A wide flat riser bar sitting ABOVE the saddle, with the grip kicked up —
          the opposite silhouette to the road bike's drop, and the fastest way to tell them
          apart at 14px. */}
      <path d="M16 7 16 5.8" />
      <path d="M14.1 6.2 17.5 5.5" />
      <path d="M17.5 5.5 18.3 5" />
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
