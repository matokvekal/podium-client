// The client-side UI mode a user is in — a presentation/role PREFERENCE only, never a
// permission. The server's authorization is unchanged: an "organizer" here is just someone
// who wants the full create/manage UI, and a "rider" wants the simplified one.
//
// "rider" is the default and the safe fallback: an existing install with no saved mode, or a
// stored value this build doesn't recognise, resolves to "rider" (see normalizeUserMode and
// store/userModeStore.ts). Nothing organizer-only is ever shown unless the user explicitly
// asked for it.

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
