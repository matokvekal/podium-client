// Explore Tracks home-page intro nudge — a one-time "there's a whole track library here" card
// for a genuinely new/empty visitor. See EventsListPage.tsx / ExploreTracksIntro.tsx.
//
// Dismissal is permanent, per rider, modelled on lib/safety-checklist.ts's existing pattern:
// localStorage keyed by USER, `elnino.` prefixed so lib/logout-cleanup.ts's sweep clears it on
// sign-out along with the rest of that account's local data. A signed-out visitor has no userId
// to scope by, so gets one flat, device-only key instead — there is no anonymous-device-id
// concept anywhere in this app to scope it further, and this is a navigation hint, not personal
// data.
//
// Two things set the flag, both permanent: the rider explicitly clicks "Don't show again", OR
// they are ever observed to have at least one ride (see EventsListPage.tsx) — so deleting their
// only ride later never brings the intro back. Reads that throw (private mode, blocked storage)
// treat the intro as NOT dismissed rather than crashing; a rider who never gets to dismiss it
// just sees it again next time, which is the safe direction to fail in.

const ANON_KEY = "elnino.exploreTracksIntro.v1.anon";

function keyFor(userId: number | null): string {
  return userId == null ? ANON_KEY : `elnino.exploreTracksIntro.v1.${userId}`;
}

export function isExploreTracksIntroDismissed(userId: number | null): boolean {
  try {
    return localStorage.getItem(keyFor(userId)) === "1";
  } catch {
    return false;
  }
}

export function dismissExploreTracksIntro(userId: number | null): void {
  try {
    localStorage.setItem(keyFor(userId), "1");
  } catch {
    // Private mode / blocked storage — the card just reappears next visit.
  }
}
