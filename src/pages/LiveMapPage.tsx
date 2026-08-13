/**
 * Live map — the screen this product exists for
 *
 * Route:    /events/:eventId/live
 * Loads:    GET /events/:eventId/live every 10–15 s, and the event's route once
 * Actions:  search for a rider and centre on them, tap a marker for rider detail
 * State:    the polled positions, the selected rider, the map instance
 * Calls:    GET /events/:eventId/live, GET /events/:eventId/live/:participantId
 *
 * Rules this screen must keep:
 *   * Leaflet stays lazily loaded — this file is the only entry point to it
 *   * markers are UPDATED IN PLACE on each poll, never cleared and redrawn. Redrawing
 *     flickers and throws away the rider's pan and zoom
 *   * marker states: normal, stale, finished, SOS
 *   * SOS in v1 is a red blinking marker and nothing else — no name, no phone, no
 *     notification. The blink honours prefers-reduced-motion
 *   * every time shown is converted from the API's UTC to the viewer's own timezone
 *   * on tablet and desktop the map grows and the rider list sits beside it
 *
 * The tile URL comes from config (VITE_TILE_URL) so the provider can be swapped in one
 * line. Everything drawn on top of the tiles is ours and is unaffected by that choice.
 */

import { useParams } from "react-router-dom";
import { NotBuiltYet } from "../app/NotBuiltYet";

export function LiveMapPage() {
  const { eventId } = useParams();

  return (
    <section className="stack">
      <h1>Live map</h1>
      <p className="muted">{eventId}</p>

      <NotBuiltYet
        milestone="milestone 6 — live tracking"
        needs={[
          "participant_last_location, upserted on ingest and only for newer points",
          "GET /events/:eventId/live — reads that table only, never location_points",
          "the Leaflet map itself, with OSM tiles and L.divIcon rider markers",
        ]}
      />
    </section>
  );
}
