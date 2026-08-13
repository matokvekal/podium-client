/**
 * Participants — the start list
 *
 * Route:    /events/:eventId/participants
 * Loads:    GET /events/:eventId/participants
 * Actions:  add manually, import from Excel/CSV, approve or reject, mark present or DNS,
 *           mark finishers with a time and a position
 * State:    the search term, the status filter, the import wizard step
 * Calls:    GET/POST/PATCH/DELETE /events/:eventId/participants…
 *
 * A participant does not need an account: manual entry and Excel import create riders who
 * have never opened the app. The three status axes — registration, attendance, result —
 * are independent and are never merged into one field: a rider can be approved AND present
 * AND finished at the same time.
 *
 * The import wizard is the one from Commissaire (examples/old-commissire), reused rather
 * than reinvented.
 */

import { useParams } from "react-router-dom";
import { NotBuiltYet } from "../app/NotBuiltYet";

export function ParticipantsPage() {
  const { eventId } = useParams();

  return (
    <section className="stack">
      <h1>Participants</h1>
      <p className="muted">{eventId}</p>

      <NotBuiltYet
        milestone="milestone 4 — participants"
        needs={[
          "event_participants.user_id made nullable, plus name/email/phone/category",
          "the three status columns and the finish fields",
          "the participants endpoints and the Excel/CSV import",
        ]}
      />
    </section>
  );
}
