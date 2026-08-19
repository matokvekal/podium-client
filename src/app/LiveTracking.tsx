/**
 * Compact "this event is live" summary for a non-owner viewer on EventDetailPage. The owner
 * gets the LIVE entry point in the Command card's primary-action slot instead (see
 * EventDetailPage.tsx) — this component exists only so a signed-in rider (or a guest, on a
 * public event) who isn't the owner still has an obvious way into the live page.
 *
 * Deliberately owns no map and no polling of its own — that used to duplicate what's now
 * pages/LiveEventPage.tsx's job entirely (route/rider markers, live position polling,
 * "share my location"). Two independent live-tracking implementations side by side was the
 * bug, not a feature; this is just a pointer to the one real one.
 */

import { Radio } from "lucide-react";
import { Link } from "react-router-dom";

interface LiveTrackingProps {
  eventId: string;
  isPaused: boolean;
}

export function LiveTracking({ eventId, isPaused }: LiveTrackingProps) {
  return (
    <div
      className="card row"
      style={{ justifyContent: "space-between", flexWrap: "wrap" }}
    >
      <span className="row" style={{ gap: 8 }}>
        <Radio width={16} height={16} aria-hidden="true" />
        {isPaused
          ? "Live tracking is paused by the organizer"
          : "This event is live now"}
      </span>
      <Link className="button" to={`/events/live/${eventId}`}>
        Open live map
      </Link>
    </div>
  );
}
