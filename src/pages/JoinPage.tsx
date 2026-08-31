/**
 * Join an event
 *
 * Route:    /join  and  /join/:code   (the QR code encodes the second form)
 * Loads:    GET /events/by-code/:code — unauthenticated, so the event can be shown before
 *           the rider signs in
 * Actions:  confirm the event, enter a bib if the event requires one, join
 * State:    the typed code, the looked-up event, the bib, the error
 * Calls:    GET /events/by-code/:code, POST /events/join
 *
 * Open to guests (App.tsx), because this IS the front door: an organizer shares a link or
 * prints a QR, and whoever opens it has usually never seen the app. A signed-out visitor whose
 * code resolves is sent straight on to /events/:eventId — the ride itself, with its route,
 * time, place and rider count — instead of being asked to prove who they are first. That page
 * already offers "Sign in to join" and carries them back here afterwards. A signed-in rider
 * still gets this bib/confirm form, which is the only thing they actually need.
 *
 * Both endpoints are frozen — the Android transmitter uses exactly these. Joining is
 * idempotent: re-joining returns the same participantId rather than an error, so a rider
 * who taps twice, or retries after a dropped connection, is fine.
 *
 * The placeholder below shows a proposed code format (3 letters + 3 digits, e.g. "ABC-123"),
 * requested directly — but the actual format (`DDMMYYYY` + a letter, e.g. "13082026A") is
 * generated server-side and documented as FROZEN in 07-api-contract.md, with the Android app
 * already live against it. Changing it for real is a server + Android change, not a client
 * one — see plan/server-tasks.md. This placeholder is cosmetic only; it doesn't validate or
 * enforce any format.
 *
 * This app does not transmit GPS. Joining here puts the rider on the start list; the
 * Android app is the only GPS source in v1.
 */

import jsQR from "jsqr";
import { Camera, ScanQrCode, X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError, apiRequest } from "../lib/api-client";
import { findEventByCode } from "../lib/event-code";
import type { EventSummary } from "../lib/local-db";
import { useEventsStore } from "../store/eventsStore";
import { type InviteSource, useInvitedEventsStore } from "../store/invitedEventsStore";
import styles from "./JoinPage.module.css";

/**
 * The QR encodes a full join URL ({origin}/join/{code}), same as ShareEventSheet.tsx
 * generates. Pull just the code back out of it — the last path segment, URL-decoded — so a
 * bare code string (someone's homemade QR, or a future non-URL format) still works.
 */
function extractCode(scannedText: string): string {
  const text = scannedText.trim();
  try {
    const url = new URL(text);
    const segments = url.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    if (last) return decodeURIComponent(last);
  } catch {
    // Not a URL — treat the scanned text itself as the code.
  }
  return text;
}

/**
 * Resolve a code from the public list, for the one case by-code cannot serve: a ride that has
 * already happened. See lib/event-code.ts for why that endpoint refuses it.
 *
 * No `bucket`, deliberately — the default the rest of the app sends is `upcoming`, and finished
 * rides are exactly what this is looking for. Failure is silent and returns null: this only ever
 * runs as a second chance after a 404, so the caller's existing "check the code" message is
 * already the right answer if it cannot help.
 */
async function findPublicEventByCode(rawCode: string): Promise<EventSummary | null> {
  try {
    const events = await apiRequest<EventSummary[]>("/events/public?limit=100", {
      anonymous: true,
    });
    return findEventByCode(events, rawCode);
  } catch {
    return null;
  }
}

interface EventConfig {
  eventId: string;
  name: string;
  type: "RIDE" | "RACE";
  requiresBib: boolean;
}

interface JoinResult {
  eventId: string;
  participantId: number;
  eventName: string;
  eventType: "RIDE" | "RACE";
  requiresBib: boolean;
}

export function JoinPage() {
  const { code: codeFromUrl } = useParams();
  // ShareEventSheet builds the QR with `?via=qr` and leaves the copyable link clean, so this is
  // what tells a scan apart from a forwarded link — including a scan made by the phone's own
  // camera app, which never touches the in-app scanner below. Anything else (or nothing) is a
  // link: the reading that greets rather than assumes.
  const [searchParams] = useSearchParams();
  const urlVia: InviteSource = searchParams.get("via") === "qr" ? "qr" : "link";
  const navigate = useNavigate();
  const { status } = useAuth();
  // "signed-out", specifically — during the cold-start "loading" phase we do not yet know, and
  // bouncing a returning rider to the event page before their session resolves would take the
  // bib form away from someone who needs it.
  const isGuest = status === "signed-out";

  const [code, setCode] = useState(codeFromUrl ?? "");
  const [event, setEvent] = useState<EventConfig | null>(null);
  const [bib, setBib] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const addInvite = useInvitedEventsStore((state) => state.addInvite);
  const removeInvite = useInvitedEventsStore((state) => state.removeInvite);

  const lookUp = useCallback(
    async (rawCode: string, via: InviteSource) => {
      setBusy(true);
      setError(null);
      try {
        const found = await apiRequest<EventConfig>(
          `/events/by-code/${encodeURIComponent(rawCode.trim().toUpperCase())}`,
          { anonymous: true },
        );
        setEvent(found);
        // Someone opened this code — via a shared link or by typing it in — before deciding
        // whether to actually join. Surface it in the home screen's "Invited" section until
        // they either join for real (removeInvite in join() below) or dismiss it by hand.
        addInvite({
          eventId: found.eventId,
          code: rawCode.trim().toUpperCase(),
          name: found.name,
          type: found.type,
          invitedAt: Date.now(),
          via,
          // by-code is a frozen endpoint and carries no start time, so the event page reads the
          // date off the event it loads anyway; this stays undefined and the banner falls back
          // to that. Recorded here only for a future by-code that does send one.
          startsAt: null,
        });
        // A guest gets the ride, not a form. The bib field and the Join button below are
        // meaningless to someone with no account, and the only honest thing to show them is
        // what they were actually invited to — so hand them the event page, which is open to
        // strangers and already ends in "Sign in to join". `replace` so Back leaves the app
        // (or returns to wherever the link was opened from) instead of bouncing through this
        // redirect again. The invite above is recorded first, so it is waiting for them on the
        // home screen the moment they do sign in.
        if (isGuest) {
          navigate(`/events/${found.eventId}`, { replace: true });
          return;
        }
      } catch (err) {
        // A 404 does not mean "no such ride" — see lib/event-code.ts. by-code resolves ACTIVE
        // events only, so a ride that has finished since the link was shared answers 404 while
        // still being perfectly readable at GET /events/:id. Before believing the code is
        // wrong, look for it in the public list, which carries finished rides too.
        if (err instanceof ApiError && err.status === 404) {
          const past = await findPublicEventByCode(rawCode);
          if (past) {
            // Straight to the ride, whoever is asking. Not the bib form even for a signed-in
            // rider: joining a finished event is refused server-side (joinEvent uses the same
            // active-only lookup), so offering the form would only end in a failure. The event
            // page shows the ride and its results, and already hides the join CTA once a ride
            // is over. No invite is recorded — there is nothing left to accept.
            navigate(`/events/${past.id}`, { replace: true });
            return;
          }
        }
        setEvent(null);
        setError(
          err instanceof ApiError && err.status === 404
            ? "No ride has that code, or it is no longer open to join. Check the code and try again."
            : "Could not look that code up right now.",
        );
      } finally {
        setBusy(false);
      }
    },
    [addInvite, isGuest, navigate],
  );

  // A scanned QR arrives with the code already in the URL — look it up without a tap.
  useEffect(() => {
    if (codeFromUrl) void lookUp(codeFromUrl, urlVia);
  }, [codeFromUrl, urlVia, lookUp]);

  function openScanner() {
    setScanError(null);
    setScanning(true);
  }

  function closeScanner() {
    setScanning(false);
  }

  // Drives the in-app camera scanner: opens the rear camera, samples frames onto an
  // offscreen canvas at ~12fps, and hands a decoded QR straight to lookUp() — the same call
  // that fires when a code arrives via the /join/:code URL param above. Everything (stream,
  // rAF loop) is torn down in the cleanup function, which also runs whenever `scanning`
  // flips back to false, so closing the sheet always turns the camera light off.
  useEffect(() => {
    if (!scanning) return;

    let cancelled = false;
    let stream: MediaStream | null = null;
    let rafId: number | null = null;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
      } catch {
        if (!cancelled) {
          setScanError(
            "Camera access is needed to scan a QR code — you can still enter the code manually below.",
          );
        }
        return;
      }

      if (cancelled) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }

      const video = videoRef.current;
      if (!video) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // Autoplay can reject if the sheet closed mid-start; the cleanup below handles it.
      }

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context || cancelled) return;

      let lastScanAt = 0;
      const scanIntervalMs = 1000 / 12; // ~12fps is plenty for QR decoding, keeps CPU low

      function tick(timestamp: number) {
        if (cancelled) return;
        if (
          video &&
          video.readyState === video.HAVE_ENOUGH_DATA &&
          timestamp - lastScanAt >= scanIntervalMs
        ) {
          lastScanAt = timestamp;
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context?.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = context?.getImageData(0, 0, canvas.width, canvas.height);
          const result = imageData && jsQR(imageData.data, imageData.width, imageData.height);
          if (result?.data) {
            const extracted = extractCode(result.data);
            setCode(extracted);
            setScanning(false); // closes the sheet; the cleanup below stops the camera
            void lookUp(extracted, "qr");
            return; // decoded — stop the loop instead of scheduling another frame
          }
        }
        rafId = requestAnimationFrame(tick);
      }
      rafId = requestAnimationFrame(tick);
    }

    void start();

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (stream) for (const track of stream.getTracks()) track.stop();
    };
  }, [scanning, lookUp]);

  async function join(submitEvent: FormEvent) {
    submitEvent.preventDefault();
    if (!event) return;
    // Joining is the one thing here that genuinely needs an identity — POST /events/join is
    // requireAuth. A guest is redirected to the event page above and never reaches this form,
    // but the brief cold-start "loading" window can, so send them to sign in and bring them
    // back to the ride rather than letting the request 401 and reading as a server problem.
    if (status !== "signed-in") {
      navigate("/login", { state: { from: `/events/${event.eventId}` } });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<JoinResult>("/events/join", {
        method: "POST",
        body: { eventCode: code.trim().toUpperCase(), ...(bib ? { bib } : {}) },
      });
      // Actually joined now — this belongs in My Rides (GET /events?filter=joined), not the
      // Invited list anymore. Refresh My Rides so the joined-id set picks it up immediately.
      removeInvite(result.eventId);
      void useEventsStore.getState().loadMyRides(true);
      navigate(`/events/${result.eventId}`);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 400
          ? "This event needs a bib number."
          : "Could not join right now. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack" style={{ maxWidth: "26rem" }}>
      <h1>Join an event</h1>

      {error && (
        <p className="banner banner--error" role="alert">
          {error}
        </p>
      )}

      <form
        className="card stack"
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          void lookUp(code, "code");
        }}
      >
        <label htmlFor="code">Event code</label>
        <input
          id="code"
          value={code}
          onChange={(changeEvent) => {
            setCode(changeEvent.target.value);
            setEvent(null);
          }}
          placeholder="ABC-123"
          autoComplete="off"
          autoCapitalize="characters"
          required
        />
        <p className="muted">The organizer reads this out, or you scan their QR code.</p>
        <div className="row">
          <button className="button" type="submit" disabled={busy || code.trim().length < 4}>
            Find the event
          </button>
          <button
            className="button button--quiet"
            type="button"
            onClick={openScanner}
            disabled={busy}
          >
            <ScanQrCode width={16} height={16} aria-hidden="true" style={{ marginRight: 6 }} />
            Scan QR
          </button>
        </div>
      </form>

      {scanning && (
        <>
          <div className={styles.sheetOverlay} onClick={closeScanner} aria-hidden="true" />
          <div className={`${styles.sheet} ${styles.sheetOpen}`}>
            <div className={styles.sheetHeader}>
              <h2 style={{ margin: 0 }}>Scan QR code</h2>
              <button
                type="button"
                className="button button--quiet"
                onClick={closeScanner}
                aria-label="Close"
              >
                <X width={18} height={18} aria-hidden="true" />
              </button>
            </div>
            <div className={`stack ${styles.sheetBody}`}>
              {scanError ? (
                <p className="banner banner--error" role="alert">
                  <Camera
                    width={16}
                    height={16}
                    aria-hidden="true"
                    style={{ marginRight: 6, verticalAlign: "text-bottom" }}
                  />
                  {scanError}
                </p>
              ) : (
                <div className={styles.videoWrap}>
                  <video ref={videoRef} className={styles.video} muted playsInline autoPlay />
                </div>
              )}
              <p className="muted" style={{ fontSize: "0.85rem" }}>
                Point the camera at the organizer's QR code.
              </p>
            </div>
          </div>
        </>
      )}

      {event && (
        <form className="card stack" onSubmit={join}>
          <h2>{event.name}</h2>
          <p className="muted">{event.type === "RACE" ? "Race" : "Ride"}</p>

          {event.requiresBib && (
            <>
              <label htmlFor="bib">Your bib number</label>
              <input
                id="bib"
                value={bib}
                onChange={(changeEvent) => setBib(changeEvent.target.value)}
                inputMode="numeric"
                required
              />
            </>
          )}

          <button className="button" type="submit" disabled={busy}>
            Join this event
          </button>
        </form>
      )}
    </section>
  );
}
