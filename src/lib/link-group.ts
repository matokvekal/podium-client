// Rides that share one link (server: sql/037-event-link-groups.sql).
//
// Two small things that were being worked out in more than one place, and got it wrong in one
// of them:
//
//   * the /share/<a>-<b> path — built by ShareEventSheet and by the ride page's chip;
//   * WHERE IN THE GROUP a ride sits — the chip rendered a literal "1 of 2", so opening the
//     second of two connected rides claimed to be the first.
//
// Both are pure string/array work, so they live here and are tested here.

/** The separator the app writes. An event code is DDMMYYYY + letters (server sql/001-init.sql),
 *  so it can never contain one — which is what makes the split unambiguous. The server also
 *  accepts "," and "+" when a person retypes a link by hand; we only ever WRITE this one. */
const CODE_SEPARATOR = "-";

/**
 * The path a shared link points at — `/share/19092026A-19092026B`.
 *
 * Codes rather than ids, so the URL stays readable in a chat and debuggable in a log. Each is
 * encoded individually: encoding the joined string would escape the separator itself and the
 * server would then see one code with a %2D in it.
 *
 * Order is preserved as given; the server resolves the group from any of the codes, so it is
 * cosmetic. Callers pass this ride first so the link reads as "this ride, plus the others".
 */
export function shareLinkPath(codes: string[]): string {
  const clean = codes.map((code) => code.trim()).filter((code) => code.length > 0);
  return `/share/${clean.map(encodeURIComponent).join(CODE_SEPARATOR)}`;
}

/** Just enough of a ride to order it within its day. */
interface GroupMember {
  eventId: string;
  startsAt: string | null;
}

/**
 * Where one ride sits in its day's group, and how big the group is — the "2 of 3" in the ride
 * page's chip.
 *
 * ⚠ THE POSITION IS DERIVED. Every ride in a group renders that chip, so a hardcoded 1 told
 * whoever opened the second ride they were looking at the first.
 *
 * Ordered by start time, which is the same order the chooser page lists them in (the server's
 * `ORDER BY starts_at`), so the chip and that page can never disagree. A ride with no start
 * time sorts last rather than being dropped — the server refuses to group one, but a cached row
 * from before that rule must still render something sane.
 *
 * `total` counts this ride plus its visible siblings. Siblings are already filtered server-side
 * to what this viewer may see, so the chip never counts a ride the chooser would then hide.
 */
export function dayGroupOrder(
  self: GroupMember,
  siblings: readonly GroupMember[],
): { position: number; total: number } {
  const ordered = [self, ...siblings].sort((a, b) =>
    // Empty string sorts before any ISO timestamp, so flip the comparison for a missing value
    // to push it to the end instead of the front.
    a.startsAt === b.startsAt
      ? 0
      : !a.startsAt
        ? 1
        : !b.startsAt
          ? -1
          : a.startsAt.localeCompare(b.startsAt),
  );

  const index = ordered.findIndex((ride) => ride.eventId === self.eventId);
  return {
    // Math.max guards the impossible-but-silent case: a list that somehow does not contain
    // this ride would otherwise report position 0.
    position: Math.max(1, index + 1),
    total: ordered.length,
  };
}
