/**
 * A small round avatar-or-initial, reused everywhere a rider/organizer name is shown next to a
 * photo (EventParticipantsPage, LiveEventPage, EventDetailPage, EventCard, EventTile,
 * RiderResultRow). Real `avatarUrl` (a Google account's profile photo, now returned by
 * GET /events/:eventId/live, /participants, and the event endpoints) wins when present, else
 * the same initial-on-a-deterministic-colour placeholder every other card in this app already
 * uses (event-visuals.ts's initialOf/placeholderColorVar) — never a fake stock photo.
 *
 * Falls back to the initial if the image itself fails to load (Google photo URLs can
 * occasionally rot/expire) instead of showing a broken-image icon — tracked per-url so a
 * changed avatarUrl (e.g. a different rider row reusing this component) gets its own chance to
 * load rather than staying stuck on a previous failure.
 *
 * Callers own sizing/shape via `className` — every render site already has (or gets) its own
 * small circular ".avatar"-style rule in its own CSS module; this component only owns the
 * img-vs-initial branch and the onError handling, so that logic lives in one place instead of
 * being copy-pasted at every render site.
 */

import { type CSSProperties, useState } from "react";
import { initialOf, placeholderColorVar } from "./event-visuals";

export function Avatar({
  name,
  avatarUrl,
  seed,
  className,
  style,
}: {
  name: string | null | undefined;
  avatarUrl?: string | null;
  /** What placeholderColorVar hashes for the fallback colour — defaults to `name`. Pass
   * something more stable (e.g. an id) when `name` can be null or shared across rows. */
  seed?: string | null;
  className?: string;
  style?: CSSProperties;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImg = !!avatarUrl && avatarUrl !== failedUrl;

  return (
    <span
      className={className}
      style={{
        background: placeholderColorVar(seed ?? name),
        overflow: "hidden",
        ...style,
      }}
      aria-hidden="true"
    >
      {showImg ? (
        <img
          src={avatarUrl ?? undefined}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          onError={() => setFailedUrl(avatarUrl ?? null)}
        />
      ) : (
        initialOf(name)
      )}
    </span>
  );
}
