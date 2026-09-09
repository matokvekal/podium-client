// The client-side UI mode a user is in — a presentation/role PREFERENCE only, never a
// permission. The server's authorization is unchanged: an "organizer" here is just someone
// who wants the full create/manage UI, and a "rider" wants the simplified one.
//
// "rider" is the safe fallback: a stored value this build doesn't recognise resolves to
// "rider" (see normalizeUserMode and store/userModeStore.ts), and nothing organizer-only is
// shown on an account the server has not enabled. The one exception is a genuine first run
// on an enabled account, which starts in "organizer" and saves that — see
// shouldDefaultToOrganizer below.

export type UserMode = "rider" | "organizer";

export const DEFAULT_USER_MODE: UserMode = "rider";

/** Anything that isn't exactly "organizer" — including undefined, a legacy value, or junk
 *  from a corrupted localStorage entry — is treated as "rider". */
export function normalizeUserMode(value: unknown): UserMode {
  return value === "organizer" ? "organizer" : "rider";
}

/**
 * Should the app drop a stored "organizer" preference back to "rider" because the server says
 * this account may not create rides?
 *
 * ONLY on an explicit `false` from a real GET /users/me. `undefined` (a cached v1 profile, an
 * offline cold start — we simply don't know) leaves the stored preference untouched: the
 * server still enforces creation server-side, so a stale "organizer" UI at worst shows a
 * button that 403s, which is far less bad than yanking the tools from someone who is offline
 * and legitimately an organizer.
 */
export function shouldForceRiderMode(canOrganize: boolean | undefined): boolean {
  return canOrganize === false;
}

/**
 * Whether the "I also organize events" switch should be interactive. The server has to have
 * affirmatively said yes — an unknown (`undefined`) leaves it disabled, with the "ask to
 * organize" path shown instead, which is the safe default for a first-run account.
 */
export function organizerSwitchEnabled(canOrganize: boolean | undefined): boolean {
  return canOrganize === true;
}

/**
 * Should a first-run account be dropped into Organizer mode without being asked?
 *
 * Yes, but only for someone who has never expressed a preference (`hasChosen: false` — no
 * stored mode at all) AND whose account the server has affirmatively enabled. Someone the
 * server enabled deliberately is an organizer; making them hunt for the switch before they
 * can create their first ride is the wrong first run. Everyone else keeps "rider": an
 * unknown (`undefined`) eligibility is not a yes, and a stored preference — including an
 * explicit "rider" — always wins over this default, so we never re-flip a returning user
 * who switched it off.
 *
 * The caller persists the result (store/userModeStore.ts `adoptOrganizerDefault`), so this
 * only ever decides a first run: from then on it is a stored choice like any other.
 */
export function shouldDefaultToOrganizer(
  canOrganize: boolean | undefined,
  hasChosen: boolean,
): boolean {
  return !hasChosen && organizerSwitchEnabled(canOrganize);
}
