/**
 * Event detail
 *
 * Route:    /events/:eventId
 * Loads:    GET /events/:eventId — respects the event's visibility settings
 * Actions:  publish, start, finish (owner); open participants, route or the live map
 * State:    none of its own beyond the loaded event
 * Calls:    GET /events/:eventId, POST /events/:eventId/{publish,start,finish}
 *
 * This is the hub: everything about one event is reachable from here. It also applies the
 * event's display_mode, so opening a race switches the interface to competition styling and
 * leaving it switches back.
 */

import { Link, useParams } from "react-router-dom";
import { NotBuiltYet } from "../app/NotBuiltYet";

export function EventDetailPage() {
  const { eventId } = useParams();

  return (
    <section className="stack">
      <h1>Event</h1>
      <p className="muted">{eventId}</p>

      <nav className="stack">
        <Link className="button button--quiet" to={`/events/${eventId}/participants`}>
          Participants
        </Link>
        <Link className="button button--quiet" to={`/events/${eventId}/live`}>
          Live map
        </Link>
      </nav>

      <NotBuiltYet
        milestone="milestone 2 — events and ownership"
        needs={["GET /events/:eventId", "the status workflow endpoints", "route attachment"]}
      />
    </section>
  );
}
