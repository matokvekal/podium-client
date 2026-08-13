/**
 * Events list — the home screen
 *
 * Route:    /
 * Loads:    GET /events?filter=upcoming|live|past|mine|joined
 * Actions:  open an event, create one, join one by code
 * State:    the active filter
 * Calls:    GET /events
 *
 * Two audiences share this screen: an organizer looking at events they own, and a rider
 * looking at events they joined. The filter decides which, and "live" comes first because
 * that is what someone opens the app at a start line to find.
 */

import { Link } from "react-router-dom";
import { NotBuiltYet } from "../app/NotBuiltYet";

export function EventsListPage() {
  return (
    <section className="stack">
      <h1>Events</h1>

      <div className="stack">
        <Link className="button" to="/events/new">
          Create an event
        </Link>
        <Link className="button button--quiet" to="/join">
          Join with a code
        </Link>
      </div>

      <NotBuiltYet
        milestone="milestone 2 — events and ownership"
        needs={[
          "events.owner_id, so an event can belong to someone",
          "GET /events — my events, filterable",
          "the event status workflow: draft → published → ready → live → finished",
        ]}
      />
    </section>
  );
}
