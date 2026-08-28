// Pure logic for the rider location broadcaster. The stateful parts — the single
// watchPosition watcher, the upload interval, the visibility/focus listeners — live in
// app/useLocationBroadcast.ts; everything here is a plain function so it can be unit-tested.
//
// Scope note: until now the PWA only *displayed* GPS (the Android app was the only
// transmitter). It now also transmits during a LIVE event the rider belongs to, reusing the
// frozen POST /api/v1/events/:eventId/locations/batch endpoint — see plan/07-api-contract.md
// and ELNINO_CLIENT_AGENT_SOURCE_OF_TRUTH.md §14.

/** One GPS fix, in exactly the shape the batch endpoint's `points[]` expects. */
export interface GpsPoint {
  lat: number;
  lng: number;
  /** Metres, when the device reports it. Omitted otherwise (the field is optional server-side). */
  accuracy?: number;
  /** Device GPS time, ISO 8601 — NOT upload time. The server stores `received_at` separately. */
  recordedAt: string;
  /** No SOS UI on the web client, so always false here. */
  emergency: false;
}

export interface BroadcastConditions {
  /** The OS/browser has granted (or already had) geolocation permission. */
  permissionGranted: boolean;
  /** The event is live right now (effectiveStatus/status === "live"). */
  eventIsLive: boolean;
  /** The event has finished or been cancelled. */
  eventIsFinished: boolean;
  /** This user has a participant row on the event (event.myParticipant != null). */
  userBelongsToEvent: boolean;
  /** The user tapped "stop sharing" for this event — persisted per event, survives backgrounding. */
  manuallyStopped: boolean;
}

/**
 * The single source of truth for "should we be transmitting right now". Called on every
 * relevant change AND every time the app returns to the foreground — if it flips back to true
 * there, the watcher is recreated; if it is false (event finished while backgrounded, rider
 * left, manual stop), the watcher stays torn down.
 */
export function shouldTransmitLocation(c: BroadcastConditions): boolean {
  return (
    c.permissionGranted &&
    c.eventIsLive &&
    !c.eventIsFinished &&
    c.userBelongsToEvent &&
    !c.manuallyStopped
  );
}

/** Batch endpoint hard limit (plan/07-api-contract.md): 1–200 points per request. The buffer
 *  is capped at this so a long offline stretch can't grow it without bound; oldest points are
 *  dropped first (the newest fixes are the ones worth keeping). */
export const MAX_BUFFERED_POINTS = 200;

export function appendPoint(buffer: GpsPoint[], point: GpsPoint): GpsPoint[] {
  const next = [...buffer, point];
  return next.length > MAX_BUFFERED_POINTS ? next.slice(next.length - MAX_BUFFERED_POINTS) : next;
}

/** sessionStorage key for the per-event manual-stop flag. sessionStorage (not localStorage):
 *  the stop must survive a tab going to the background and a same-session reload, but a brand
 *  new session starts clean. Mirrors EventDetailPage's `elnino.approval-seen.<id>` pattern. */
export function locationStoppedKey(eventId: string): string {
  return `elnino.location-stopped.${eventId}`;
}
