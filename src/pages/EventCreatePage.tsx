/**
 * Event create / edit
 *
 * Route:    /events/new  (and the same form for editing, later)
 * Loads:    nothing when creating
 * Actions:  create an event; the server generates the join code (DDMMYYYY + a letter)
 * State:    the form fields
 * Calls:    POST /events, PATCH /events/:eventId
 *
 * Kind (RIDE | RACE) is what the event IS. Display mode (standard | competition) is only
 * how it looks. A serious training ride is a RIDE shown in competition mode — not a third
 * kind. Keep those two fields visually apart on the form so nobody conflates them.
 */

import { NotBuiltYet } from "../app/NotBuiltYet";

export function EventCreatePage() {
  return (
    <section className="stack">
      <h1>Create an event</h1>
      <NotBuiltYet
        milestone="milestone 2 — events and ownership"
        needs={[
          "POST /events, with owner_id set at creation",
          "visibility and the six show_* settings",
          "the generated join code returned for the QR screen",
        ]}
      />
    </section>
  );
}
