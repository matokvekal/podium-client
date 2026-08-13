/**
 * History
 *
 * Route:    /history
 * Loads:    past events, and the saved track for a chosen one
 * Actions:  open an event's results and draw a rider's ride line
 * State:    the selected event and rider
 * Calls:    GET /events?filter=past, GET /events/:eventId/tracks
 *
 * History reads participant_tracks, never location_points. Raw points are deleted after
 * the retention window; the simplified track is kept forever, so what this screen shows
 * never changes when the cleanup runs.
 */

import { NotBuiltYet } from "../app/NotBuiltYet";

export function HistoryPage() {
  return (
    <section className="stack">
      <h1>History</h1>

      <NotBuiltYet
        milestone="milestone 7 — finish and history"
        needs={[
          "participant_tracks, written when an event finishes",
          "GET /events/:eventId/tracks",
          "results: finish time and position",
        ]}
      />
    </section>
  );
}
