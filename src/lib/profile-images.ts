/**
 * The operator-managed profile-image gallery: a curated set of avatar photos the server
 * publishes from a folder it manages by hand (elnino-server's PROFILE_IMAGES_DIR), NOT the
 * hardcoded SVG preset registry in lib/identity-presets.ts. See AccountPage.tsx for the picker
 * and gilad/api-contract.md-style notes in the server repo for the full contract.
 *
 * Unlike the preset/upload picker (store/userIdentityStore.ts), a gallery pick is written
 * straight to the server — there is no device-local copy and nothing here touches that store.
 * `useAuth().profile.avatar` already carries the result once the PUT below resolves, through
 * the same `avatar` field a preset or upload would set.
 */

import type { Profile } from "../auth/AuthContext";
import { apiRequest } from "./api-client";

export interface ProfileImage {
  /** The bare filename — stable for as long as the file exists on the server. */
  key: string;
  url: string;
}

/** GET /api/v1/profile-images — public, fetched only when the gallery section is opened. */
export async function fetchProfileImages(): Promise<ProfileImage[]> {
  return apiRequest<ProfileImage[]>("/profile-images", { anonymous: true });
}

/**
 * PUT /api/v1/users/me/avatar with { galleryKey }. Returns the updated profile so the caller
 * can hand it straight to whatever already applies a fresh profile (e.g. AuthContext's own
 * updateProfile plumbing) without a second round trip.
 */
export async function selectGalleryImage(galleryKey: string): Promise<Profile> {
  return apiRequest<Profile>("/users/me/avatar", { method: "PUT", body: { galleryKey } });
}
