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

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, apiRequest } from "../lib/api-client";

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
  const navigate = useNavigate();

  const [code, setCode] = useState(codeFromUrl ?? "");
  const [event, setEvent] = useState<EventConfig | null>(null);
  const [bib, setBib] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lookUp = useCallback(async (rawCode: string) => {
    setBusy(true);
    setError(null);
    try {
      const found = await apiRequest<EventConfig>(
        `/events/by-code/${encodeURIComponent(rawCode.trim().toUpperCase())}`,
        { anonymous: true },
      );
      setEvent(found);
    } catch (err) {
      setEvent(null);
      setError(
        err instanceof ApiError && err.status === 404
          ? "No event has that code. Check it and try again."
          : "Could not look that code up right now.",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  // A scanned QR arrives with the code already in the URL — look it up without a tap.
  useEffect(() => {
    if (codeFromUrl) void lookUp(codeFromUrl);
  }, [codeFromUrl, lookUp]);

  async function join(submitEvent: FormEvent) {
    submitEvent.preventDefault();
    if (!event) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<JoinResult>("/events/join", {
        method: "POST",
        body: { eventCode: code.trim().toUpperCase(), ...(bib ? { bib } : {}) },
      });
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
          void lookUp(code);
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
        <button className="button" type="submit" disabled={busy || code.trim().length < 4}>
          Find the event
        </button>
      </form>

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
