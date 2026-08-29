/**
 * Splash screen
 *
 * Shown once per cold start, for four seconds (asked for directly), layered over the real
 * app while it mounts underneath — it does not delay anything; routing and auth are already
 * loading in parallel behind it.
 *
 * Purely presentational: a dark, glowing road route — straight streets meeting at angled
 * junctions, like a real map, not a smooth circle — with a scatter of small rider dots, one
 * of them blinking red like a radar ping. It is a wordless pitch for what this app is for —
 * a group riding together, watched over, with trouble visible the instant it happens. The
 * red-and-blinking language for "needs help" is the same one the real SOS marker on the live
 * map uses (see AGENT.md); reused here on purpose, not a coincidence.
 *
 * The mark itself (public/logo.png — a swirl, picked from logos.png's set: "start at top like
 * a wheel and turn down like a tornado, blue shine fluorescent," asked for directly) spins for
 * as long as the splash is on screen, echoing the tornado shape rather than sitting still. Also
 * asked for directly: shifted higher in the stage rather than dead-center, sized 200% bigger
 * (3x) than its original 64px, and re-tinted to a random hue on every mount rather than always
 * the same blue — see splash-screen.css's .splash__mark/.splash__mark-logo for the how/why.
 *
 * Layout, also asked for directly: the "El Niño Move" wordmark sits at the very top of the
 * stage, in a large font, with the spinning logo below it — so the name reads first and stays
 * visible alongside the animation, rather than being tucked under the logo.
 */

import { type CSSProperties, useEffect, useState } from "react";
import "./splash-screen.css";

const VISIBLE_MS = 4000;
const FADE_MS = 300;

// Riders bunch up on a real ride — a few small groups strung out along the route, not one
// rider every few metres. Three clusters near the road route (the SVG path below), 2-3
// riders each. The one in trouble rides alone, apart from any group — that separation is
// part of how it reads as "found": everyone else is together, this one isn't.
const RIDERS: { id: string; x: number; y: number; sos?: boolean }[] = [
  // Lead group, along the top straight
  { id: "r1", x: 58, y: 9 },
  { id: "r2", x: 65, y: 8 },
  { id: "r3", x: 61, y: 12 },

  // Chase pair, the right-hand straight
  { id: "r4", x: 89, y: 36 },
  { id: "r5", x: 91, y: 43 },

  // Group at the back, lower left straight
  { id: "r6", x: 19, y: 74 },
  { id: "r7", x: 24, y: 79 },
  { id: "r8", x: 15, y: 68 },

  // Off on their own, lower right — the one that needs help
  { id: "r9", x: 77, y: 68, sos: true },
];

export function SplashScreen() {
  const [phase, setPhase] = useState<"visible" | "fading" | "done">("visible");
  // A fresh random tint each time the splash mounts ("each time at different color") — picked
  // once per mount, not re-rolled on rerender, and applied via the --logo-hue custom property
  // splash-screen.css's .splash__mark-logo reads (see that file for why it's a CSS var rather
  // than an inline `filter`).
  const [logoHue] = useState(() => Math.floor(Math.random() * 360));

  useEffect(() => {
    const toFade = setTimeout(() => setPhase("fading"), VISIBLE_MS);
    const toDone = setTimeout(() => setPhase("done"), VISIBLE_MS + FADE_MS);
    return () => {
      clearTimeout(toFade);
      clearTimeout(toDone);
    };
  }, []);

  if (phase === "done") return null;

  return (
    <div className={phase === "fading" ? "splash splash--fading" : "splash"} aria-hidden="true">
      <div className="splash__glow" />
      <div className="splash__grid" />

      <div className="splash__stage">
        {/* A road route, not a circle: straight segments meeting at angled junctions, plus
            three short spur roads branching off — reads as a real street map, not a loop
            drawn with a compass. */}
        <svg className="splash__track" viewBox="0 0 100 100" aria-hidden="true">
          <path
            className="splash__track-glow"
            d="M50,12 L78,8 L94,30 L90,54 L74,58 L78,82 L52,96 L26,88 L8,64 L14,38 L30,14 Z
               M78,8 L93,3 M8,64 L-5,58 M52,96 L57,101"
          />
          <path
            className="splash__track-line"
            d="M50,12 L78,8 L94,30 L90,54 L74,58 L78,82 L52,96 L26,88 L8,64 L14,38 L30,14 Z
               M78,8 L93,3 M8,64 L-5,58 M52,96 L57,101"
          />
        </svg>

        {RIDERS.map((rider, index) => (
          <span
            key={rider.id}
            className={rider.sos ? "splash__dot splash__dot--sos" : "splash__dot"}
            style={{
              left: `${rider.x}%`,
              top: `${rider.y}%`,
              animationDelay: `${index * 0.2}s`,
            }}
          />
        ))}

        {/* The storm icon stays dead-centre in the track, spinning — independent of the
            wordmark, which sits up top as a header. */}
        <div className="splash__logo-wrap">
          <img
            className="splash__mark-logo"
            src="/logo.png"
            alt=""
            aria-hidden="true"
            width={192}
            height={192}
            style={{ "--logo-hue": `${logoHue}deg` } as CSSProperties}
          />
        </div>

        <div className="splash__mark">
          {/* data-text feeds the ::after that carries the moving light — see splash-screen.css */}
          <span className="splash__mark-name" data-text="El Niño Move">
            El Niño Move
          </span>
          <span className="splash__mark-tag">Ride together</span>
        </div>
      </div>
    </div>
  );
}
