// Full-screen player for a track's flyover video (lib/route-video.ts). Opened from the ride
// page's "▶ Video" button in the Route Preview header.
//
// UX rules:
//   - Covers the whole viewport on black; the video is letterboxed (object-fit: contain), never
//     cropped, so portrait phone videos and landscape exports both read correctly.
//   - One obvious way out: a big X top-right (44px target, clear of the notch via safe-area
//     insets). Escape and the phone's Back gesture close it too — Back must not leave the ride.
//   - Tries to play WITH sound (the tap that opened it is the user gesture). If the browser
//     still refuses — the bytes arrive after an await — it falls back to muted autoplay and
//     shows a "Tap for sound" chip rather than a frozen first frame.
//   - Deliberately NOT requestFullscreen(): native fullscreen hides this X, and on iOS it hands
//     the video to the system player. The fixed layer is already the whole screen.
//
// The file needs the bearer token, so it is fetched as a blob and played from an object URL,
// which is revoked when the player closes.

import { Volume2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchRouteVideoUrl, formatVideoDuration } from "../lib/route-video";
import styles from "./RouteVideoOverlay.module.css";

const HISTORY_KEY = "routeVideoOverlay";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; url: string }
  | { kind: "error"; message: string };

export function RouteVideoOverlay({
  routeId,
  title,
  durationS,
  onClose,
}: {
  routeId: number;
  title: string;
  durationS?: number | null;
  onClose: () => void;
}) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [needsSound, setNeedsSound] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Load the bytes; revoke the object URL whenever it is replaced or the player closes.
  // `attempt` is the Retry button's trigger — it is meant to re-run this effect.
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt re-runs the fetch on Retry
  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setState({ kind: "loading" });
    fetchRouteVideoUrl(routeId)
      .then((u) => {
        if (cancelled) {
          if (u) URL.revokeObjectURL(u);
          return;
        }
        if (!u) {
          setState({ kind: "error", message: "This track's video is no longer available." });
          return;
        }
        url = u;
        setState({ kind: "ready", url: u });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error", message: "Couldn't load the video." });
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [routeId, attempt]);

  // Back gesture closes the player instead of leaving the ride page.
  useEffect(() => {
    const st = window.history.state as Record<string, unknown> | null;
    if (!st?.[HISTORY_KEY]) window.history.pushState({ ...(st ?? {}), [HISTORY_KEY]: true }, "");
    const onPop = () => onCloseRef.current();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const requestClose = useCallback(() => {
    videoRef.current?.pause();
    const st = window.history.state as Record<string, unknown> | null;
    // Pop our own history entry; its popstate then closes us. Otherwise close directly.
    if (st?.[HISTORY_KEY]) window.history.back();
    else onCloseRef.current();
  }, []);

  // Escape, scroll lock, focus the X.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [requestClose]);

  // Start playback: with sound if the browser allows it, else muted with a sound chip.
  useEffect(() => {
    if (state.kind !== "ready") return;
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    const p = video.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => {
        video.muted = true;
        setNeedsSound(true);
        void video.play().catch(() => undefined);
      });
    }
  }, [state]);

  const length = formatVideoDuration(durationS);

  return createPortal(
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={`${title} — track video`}
    >
      <div className={styles.topBar}>
        <div className={styles.titleBlock}>
          <span className={styles.title}>{title}</span>
          {length && <span className={styles.length}>{length}</span>}
        </div>
        <button
          ref={closeRef}
          type="button"
          className={styles.closeBtn}
          onClick={requestClose}
          aria-label="Close video"
        >
          <X aria-hidden="true" size={26} strokeWidth={2.5} />
        </button>
      </div>

      <div className={styles.stage}>
        {state.kind === "loading" && (
          <div className={styles.center}>
            <span className="spinner" aria-hidden="true" />
            <span className={styles.status}>Loading video…</span>
          </div>
        )}
        {state.kind === "error" && (
          <div className={styles.center} role="alert">
            <span className={styles.status}>{state.message}</span>
            <button
              type="button"
              className={styles.retryBtn}
              onClick={() => setAttempt((n) => n + 1)}
            >
              Try again
            </button>
          </div>
        )}
        {state.kind === "ready" && (
          // biome-ignore lint/a11y/useMediaCaption: a rider's silent/ambient flyover has no captions to offer
          <video
            ref={videoRef}
            className={styles.video}
            src={state.url}
            controls
            playsInline
            autoPlay
            preload="auto"
            // Corrupt / unsupported file: say so in the player instead of a frozen black frame.
            onError={() =>
              setState({ kind: "error", message: "This video can't be played on this device." })
            }
            onVolumeChange={(e) => {
              if (!e.currentTarget.muted) setNeedsSound(false);
            }}
          />
        )}
        {state.kind === "ready" && needsSound && (
          <button
            type="button"
            className={styles.soundChip}
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              v.muted = false;
              setNeedsSound(false);
              void v.play().catch(() => undefined);
            }}
          >
            <Volume2 aria-hidden="true" size={16} />
            Tap for sound
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
