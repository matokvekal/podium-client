/**
 * A small round avatar-or-initial, reused everywhere a rider/organizer name is shown next to a
 * photo (EventParticipantsPage, LiveEventPage, EventDetailPage, EventCard, EventTile,
 * RiderResultRow, and the app header/drawer for the signed-in rider themselves).
 *
 * The picture is chosen by resolveUserAvatar (lib/user-identity.ts), which owns the whole
 * chain in one place: a chosen upload or preset first, then the Google profile photo, then
 * nothing — at which point this draws the same initial-on-a-deterministic-colour placeholder
 * every other card in this app already uses (event-visuals.ts's initialOf/placeholderColorVar).
 * Never a fake stock photo.
 *
 * Passing only `avatarUrl` — as every original call site does — behaves exactly as it always
 * has: the chain simply has nothing above the provider photo to find.
 *
 * Falls back to the initial if the image itself fails to load (Google photo URLs can
 * occasionally rot/expire, and a preset id from a newer server may point at a file this build
 * does not ship) instead of showing a broken-image icon — tracked per-url so a changed avatar
 * gets its own chance to load rather than staying stuck on a previous failure.
 *
 * Callers own sizing/shape via `className` — every render site already has (or gets) its own
 * small circular ".avatar"-style rule in its own CSS module; this component only owns the
 * img-vs-initial branch and the onError handling, so that logic lives in one place instead of
 * being copy-pasted at every render site.
 */

import { type CSSProperties, useState } from "react";
import {
  type LocalVisualSelection,
  resolveUserAvatar,
  type UserVisualAsset,
} from "../lib/user-identity";
import { initialOf, placeholderColorVar } from "./event-visuals";

export function Avatar({
  name,
  avatarUrl,
  identity,
  localSelection,
  seed,
  className,
  style,
}: {
  name: string | null | undefined;
  avatarUrl?: string | null;
  /** The person's chosen avatar as the server sent it. Absent from every response today. */
  identity?: UserVisualAsset | null;
  /** This device's temporary pick — only ever passed for the signed-in viewer themselves. */
  localSelection?: LocalVisualSelection | null;
  /** What placeholderColorVar hashes for the fallback colour — defaults to `name`. Pass
   * something more stable (e.g. an id) when `name` can be null or shared across rows. */
  seed?: string | null;
  className?: string;
  style?: CSSProperties;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const resolved = resolveUserAvatar({ avatar: identity, avatarUrl }, localSelection, seed);
  const showImg = !!resolved.url && resolved.url !== failedUrl;

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
          src={resolved.url ?? undefined}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          onError={() => setFailedUrl(resolved.url)}
        />
      ) : (
        initialOf(name)
      )}
    </span>
  );
}
