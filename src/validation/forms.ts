// Every form rule in the app, in one file.
//
// Each function answers one question — "can this form be submitted, and if not, which fields
// are wrong?" — and nothing else. They do no fetching, touch no store, and know nothing about
// React. A page calls one of these, and if `ok` is false it renders the errors and stops.
//
// The rules here are exactly the rules the forms already enforced inline; this moves them
// somewhere a developer can read all of them at once instead of hunting through a submit
// handler. Nothing became stricter or looser.

/**
 * `ok` is the whole answer — when it is false, `errors` has one entry per failed field, keyed
 * by the field name the form uses for its own state, so a page can highlight inputs directly.
 */
export interface ValidationResult<Field extends string> {
  ok: boolean;
  errors: Partial<Record<Field, string>>;
}

function result<Field extends string>(
  errors: Partial<Record<Field, string>>,
): ValidationResult<Field> {
  return { ok: Object.keys(errors).length === 0, errors };
}

// --- profile / onboarding ------------------------------------------------------------------

export type ProfileField = "firstName" | "lastName" | "nickname" | "country";

export interface ProfileFormValues {
  firstName: string;
  lastName: string;
  nickname: string;
  country: string;
}

/**
 * Required: first name, last name, nickname, country.
 * Optional: emergency phone — collected for a future SOS feature, never a reason to block.
 *
 * The server decides `requiresProfile` from first/last/nickname only (07-api-contract.md);
 * country is a client-side requirement of this form and is not sent yet (no `country` column
 * on users — see ProfileSetupPage's note).
 */
export function validateProfileForm(values: ProfileFormValues): ValidationResult<ProfileField> {
  const errors: Partial<Record<ProfileField, string>> = {};
  if (!values.firstName.trim()) errors.firstName = "First name is required.";
  if (!values.lastName.trim()) errors.lastName = "Last name is required.";
  if (!values.nickname.trim()) errors.nickname = "Nickname is required.";
  if (!values.country) errors.country = "Select your country.";
  return result(errors);
}

// --- create event --------------------------------------------------------------------------

export type CreateEventField = "name" | "startsAt" | "route";

export interface CreateEventFormValues {
  name: string;
  startsAt: string;
  /** True once a track has been picked or uploaded. */
  hasRoute: boolean;
  /** Edit mode only ever requires a name — see below. */
  isEditing: boolean;
}

/**
 * Creating requires a name, a start date/time and a track.
 *
 * Editing requires only a name, on purpose: a route is never prefilled back into the edit
 * form (there is no server field to read it from), so demanding one there would trap every
 * edit behind re-picking a track the event already has.
 */
export function validateCreateEventForm(
  values: CreateEventFormValues,
): ValidationResult<CreateEventField> {
  const errors: Partial<Record<CreateEventField, string>> = {};
  if (!values.name.trim()) errors.name = "Name is required.";
  if (!values.isEditing) {
    if (!values.startsAt.trim()) errors.startsAt = "Start date and time are required.";
    if (!values.hasRoute) errors.route = "Pick a track for this ride.";
  }
  return result(errors);
}

// --- join a ride ---------------------------------------------------------------------------

export type JoinRideField = "code";

export interface JoinRideFormValues {
  code: string;
}

/**
 * An event code is `DDMMYYYY` plus a letter suffix (07-api-contract.md), so anything shorter
 * than 4 characters cannot be one — the same minimum the code entry already used. It is
 * deliberately only a length check: the server decides whether a code is real.
 *
 * Bib is NOT validated here. `POST /events/join` accepts it as optional and the server
 * enforces `requiresBib` itself; adding a client rule would be a new restriction, not a
 * description of the existing one.
 */
export function validateJoinRideForm(values: JoinRideFormValues): ValidationResult<JoinRideField> {
  const errors: Partial<Record<JoinRideField, string>> = {};
  if (values.code.trim().length < 4) errors.code = "Enter the event code.";
  return result(errors);
}
