// The Event Completion Medal itself — pure inline SVG (no image files are generated or stored):
// a two-tone ribbon, a gold disc with a laurel ring, a bike and a star. `shine` adds the gold
// light sweep; `size` is the rendered width in px (the ribbon makes it a little taller).

import { useId } from "react";
import styles from "./Medals.module.css";

export function MedalBadge({
  size = 72,
  shine = false,
  muted = false,
  className,
}: {
  size?: number;
  shine?: boolean;
  /** Grey silhouette — the empty-collection state. */
  muted?: boolean;
  className?: string;
}) {
  // Gradient ids must be unique per instance, or every medal on the page shares the first one's.
  const uid = useId().replace(/:/g, "");
  const gold = `g${uid}`;
  const rim = `r${uid}`;
  return (
    <span
      className={`${styles.medalBadge} ${shine ? styles.medalShine : ""} ${muted ? styles.medalMuted : ""} ${className ?? ""}`}
      style={{ width: size, height: size * 1.25 }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 80 100" width={size} height={size * 1.25} focusable="false">
        <defs>
          <radialGradient id={gold} cx="38%" cy="34%" r="70%">
            <stop offset="0%" stopColor="#FFF6C8" />
            <stop offset="38%" stopColor="#F7C948" />
            <stop offset="75%" stopColor="#D69E1E" />
            <stop offset="100%" stopColor="#A86E0B" />
          </radialGradient>
          <linearGradient id={rim} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFE58A" />
            <stop offset="50%" stopColor="#B7791F" />
            <stop offset="100%" stopColor="#FFE58A" />
          </linearGradient>
        </defs>
        {/* Ribbon: two straps meeting behind the disc. */}
        <path d="M22 0h16l10 40H32z" fill="#1E5BD8" />
        <path d="M42 0h16L48 40H32z" fill="#E0413A" />
        <path d="M27 0h4l9 36-3 3z" fill="#ffffff" opacity="0.55" />
        <path d="M49 0h4l-11 39-3-3z" fill="#ffffff" opacity="0.55" />
        {/* Disc */}
        <circle cx="40" cy="64" r="30" fill={`url(#${rim})`} />
        <circle cx="40" cy="64" r="26" fill={`url(#${gold})`} />
        <circle cx="40" cy="64" r="21.5" fill="none" stroke="#A86E0B" strokeWidth="1" opacity="0.55" strokeDasharray="2 2.4" />
        {/* Star */}
        <path
          d="M40 46.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z"
          fill="#FFF3B0"
          stroke="#A86E0B"
          strokeWidth="0.8"
        />
        {/* Bike */}
        <g fill="none" stroke="#7A4E05" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="31" cy="72" r="5.2" />
          <circle cx="49" cy="72" r="5.2" />
          <path d="M31 72l5-9h8l5 9M36 63l4 9h-9M44 63l-2-3h-3" />
        </g>
      </svg>
    </span>
  );
}
