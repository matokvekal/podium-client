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
