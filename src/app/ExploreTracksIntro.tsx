/**
 * A one-time nudge on Home pointing a genuinely new/ride-less visitor at Find Tracks — the
 * discovery problem this exists for is that the track library is real and large, but nothing on
 * Home says so. Not a tutorial: one line, two actions, gone the moment it's no longer useful.
 *
 * Visibility is entirely the caller's job (EventsListPage.tsx) — this component only renders
 * what it's told to and reports its own dismissal back up, the same split the "event created"
 * banner right above it in that file already uses.
 */

import { Compass, X } from "lucide-react";
import { Link } from "react-router-dom";
import { dismissExploreTracksIntro } from "../lib/explore-tracks-intro";

export function ExploreTracksIntro({
  userId,
  onDismiss,
}: {
  userId: number | null;
  onDismiss: () => void;
}) {
  function dismiss() {
    dismissExploreTracksIntro(userId);
    onDismiss();
  }

  return (
    <div className="banner banner--auto" role="status">
      <span className="row" style={{ gap: 8 }}>
        <Compass aria-hidden="true" />
        <span>
          <strong>Explore Tracks</strong> — discover Road, Gravel and MTB routes around you.
        </span>
      </span>
      <span className="row" style={{ gap: 8 }}>
        {/* Navigates only — does not dismiss. "Don't show again" (below) is the one explicit
            dismissal; a rider who just follows the link should still see this again next time
            they're on Home with no rides, same as any other nav item. */}
        <Link className="button" to="/findtracks">
          Explore Tracks
        </Link>
        <button
          type="button"
          className="button button--quiet"
          onClick={dismiss}
          aria-label="Don't show again"
          title="Don't show again"
        >
          <X aria-hidden="true" width={16} height={16} />
        </button>
      </span>
    </div>
  );
}
