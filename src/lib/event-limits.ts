// Field limits the create/edit form enforces, MIRROR of elnino-server/src/schemas/event.schemas.ts
// — keep the numbers identical so the form and the server agree on what is submittable. Same
// arrangement as lib/regions.ts, which mirrors the server's region list for the same reason.
//
// The client copy exists so an organizer is stopped while typing rather than by a 400 after
// they press Save. The server remains the authority: this is UX, not enforcement.

/**
 * events.description is TEXT with no length constraint at the database level, so this number
 * lives only in the two zod schemas and here. 4000 is the value the server has always used.
 */
export const DESCRIPTION_MAX_CHARS = 4000;

/** Show the counter only once it is worth showing — quiet until the organizer is near the cap. */
export const DESCRIPTION_COUNTER_VISIBLE_FROM = Math.floor(DESCRIPTION_MAX_CHARS * 0.75);

/** Past this the counter turns to the warning colour. */
export const DESCRIPTION_COUNTER_WARN_FROM = Math.floor(DESCRIPTION_MAX_CHARS * 0.9);
