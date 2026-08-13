/**
 * Routes — my library and the public browser
 *
 * Route:    /routes
 * Loads:    GET /routes (mine), GET /routes/public (paged, filterable)
 * Actions:  upload a GPX/TCX/GeoJSON file, draw a route, publish or unpublish, attach to
 *           an event, copy someone else's public route
 * State:    the active tab, the filters, the page
 * Calls:    GET /routes, GET /routes/public, POST /routes, PATCH /routes/:id
 *
 * The public browser shows many map previews at once, so it only ever requests
 * preview_points — never full geometry. Full geometry is loaded on the detail view alone.
 *
 * Parsing reuses Commissaire's parseTrack.ts (examples/old-commissire); distance,
 * elevation, bbox and the preview copy are computed once at upload.
 */

import { NotBuiltYet } from "../app/NotBuiltYet";

export function RouteBrowserPage() {
  return (
    <section className="stack">
      <h1>Routes</h1>

      <NotBuiltYet
        milestone="milestone 5 — routes and tracks"
        needs={[
          "the routes and event_routes tables",
          "the route parser: GPX, TCX, JSON, GeoJSON",
          "GET /routes/public, returning preview points only",
        ]}
      />
    </section>
  );
}
