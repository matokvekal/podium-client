/**
 * Splash screen
 *
 * Shown once per cold start, layered over the real app while it mounts underneath — it does
 * not delay anything; routing and auth are already loading in parallel behind it.
 *
 * It is a five-second clip of a group riding a mountain road (public/splash.mp4, cut from
 * Images/video1.mp4) with the wordmark and the spinning storm mark over it. Same wordless
 * pitch the old drawn version made — a group riding together — but with real riders. The
 * previous drawn splash (glowing road route, rider dots, blinking SOS ping) is kept verbatim
 * at src/_backup-pre-video-splash/ so it can come back.
 *
 * The clip is muted, silent and 234 KB: muted+playsInline is what lets a browser autoplay it
 * at all, and the whole point of a splash is that it is already on screen before anyone waits
 * for it. public/splash-poster.jpg is its first frame, so something real is visible in the
 * moment before the video decodes — and stays visible if autoplay is refused or the rider has
 * asked for reduced motion, in which case the video never plays and the still is the splash.
 *
 * The mark (public/logo.png — a swirl, picked from logos.png's set: "start at top like a wheel
 * and turn down like a tornado, blue shine fluorescent," asked for directly) spins for as long
 * as the splash is on screen, which doubles as the loading spinner. Re-tinted to a random hue
 * on every mount rather than always the same blue — see splash-screen.css's .splash__mark-logo.
 */

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { APP_NAME, APP_SLOGAN } from "../lib/branding";
import "./splash-screen.css";

// The clip is 4.92s and fades to black over its last half second; leaving at 4.9s hands that
// fade straight over to the app's own. Change one and the other looks wrong.
const VISIBLE_MS = 4900;
// Matches the opacity transition in splash-screen.css. The element is removed when the fade
// has actually finished, not part-way through it.
const FADE_MS = 500;

/**
 * "Once per cold start" means once per TAB, not once per page load.
 *
 * The app hard-navigates itself in a few places — signing out, and a session the server has
 * rejected (AuthContext.tsx) — which reboots the SPA and remounts this component. Without this
 * guard each of those replays the full five seconds, so an in-app redirect reads to a rider as
 * "the app restarted", which is exactly how it was reported. sessionStorage is the right scope:
 * it survives a reload in this tab (so the video does not come back), and it is gone for the
 * next launch (so a real cold start still gets its splash).
 */
const SEEN_KEY = "elnino.splash-seen";

function alreadyPlayedThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    // Storage unavailable (private mode, disabled): fall back to showing it, which is the
    // behaviour before this guard existed.
    return false;
  }
}

function markPlayed(): void {
  try {
    window.sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Nothing to do — worst case the splash plays again on the next reload.
  }
}

export function SplashScreen() {
  // Decided once, at mount, and never re-read — see SEEN_KEY above.
  const [skipped] = useState(alreadyPlayedThisSession);
  const [phase, setPhase] = useState<"visible" | "fading" | "done">(() =>
    skipped ? "done" : "visible",
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  // A fresh random tint each time the splash mounts ("each time at different color") — picked
  // once per mount, not re-rolled on rerender, and applied via the --logo-hue custom property
  // splash-screen.css's .splash__mark-logo reads (see that file for why it's a CSS var rather
  // than an inline `filter`).
  const [logoHue] = useState(() => Math.floor(Math.random() * 360));

  useEffect(() => {
    if (skipped) return;
    // Marked as soon as it starts, not when it finishes: a rider who reloads two seconds in
    // should not be handed the clip a second time either.
    markPlayed();
    const toFade = setTimeout(() => setPhase("fading"), VISIBLE_MS);
    const toDone = setTimeout(() => setPhase("done"), VISIBLE_MS + FADE_MS);
    return () => {
      clearTimeout(toFade);
      clearTimeout(toDone);
    };
  }, [skipped]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // Autoplay is a request, not a guarantee: a browser can still refuse it, and a rider who
    // asked for reduced motion should not be handed a moving picture. Either way the poster
    // frame is already on screen, so there is nothing to fall back to — it simply stays.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    video.play().catch(() => {});
  }, []);

  if (phase === "done") return null;

  return (
    <div className={phase === "fading" ? "splash splash--fading" : "splash"} aria-hidden="true">
      <video
        ref={videoRef}
        className="splash__video"
        src="/splash.mp4"
        poster="/splash-poster.jpg"
        muted
        playsInline
        preload="auto"
        // Not autoPlay: the effect above starts it, so reduced-motion is honoured before the
        // first frame moves rather than after.
        tabIndex={-1}
      />

      <div className="splash__mark">
        <img
          className="splash__mark-logo"
          src="/logo.png"
          alt=""
          aria-hidden="true"
          width={192}
          height={192}
          style={{ "--logo-hue": `${logoHue}deg` } as CSSProperties}
        />
        <span className="splash__mark-name" data-text={APP_NAME}>
          {APP_NAME}
        </span>
        <span className="splash__mark-tag">{APP_SLOGAN}</span>
      </div>
    </div>
  );
}
