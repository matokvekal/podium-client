// The shareable address of ONE track: /<terrain>/<trackId>, e.g. /mtb/1234.
//
// `trackId` is the track's routes.id — the same id likes, hearts and the reuse count hang off,
// and the one a copied ride shares with its original, so every ride built on a track shares
// one link. The terrain word leads so the link reads as what it is before it is opened.
//
// Only the three bike disciplines have a share path (they are the three Find Tracks shows as
// its quick filter). A running / hiking track, or one with no discipline, falls back to
// /mtb/<id>: the terrain segment is a label, the id alone decides what opens.

import type { SurfaceType } from "./surface-types";

export const SHARE_TERRAINS = ["mtb", "gravel", "road"] as const;
export type ShareTerrain = (typeof SHARE_TERRAINS)[number];

export function isShareTerrain(value: unknown): value is ShareTerrain {
  return typeof value === "string" && (SHARE_TERRAINS as readonly string[]).includes(value);
}

export function trackSharePath(
  activityType: SurfaceType | null | undefined,
  trackId: number,
): string {
  const terrain: ShareTerrain = isShareTerrain(activityType) ? activityType : "mtb";
  return `/${terrain}/${trackId}`;
}

/** A positive whole-number id from the URL segment, or null for anything else. */
export function parseTrackId(segment: string | undefined): number | null {
  if (!segment || !/^\d{1,15}$/.test(segment)) return null;
  const id = Number(segment);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
