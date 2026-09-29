// The System Admin's ride-image management API (/api/v1/admin/ride-images). Same server-side
// gate as GET /api/v1/admin/analytics (requireAdminAnalytics) — a non-admin gets a 403 from the
// server no matter what this client does, so there is nothing here to duplicate or trust.
//
// Upload is a separate function from apiRequest/apiMutate (lib/api-client.ts) for the same
// reason PUT /users/me/avatar is: the body is raw image bytes with a matching Content-Type, not
// JSON, so it needs its own fetch with its own headers.

import { getAccessToken } from "./auth-storage";
import { ApiError, apiRequest } from "./api-client";
import { config } from "./config";
import { shrinkImageForUpload } from "./shrink-image-for-upload";

export interface AdminRideImage {
  key: string;
  url: string;
  label: string;
  category: string;
  selectable: boolean;
  source: "static" | "upload";
  /** Bumped by every Replace; the server already appends it to `url` (?v=). */
  version?: number;
  createdAt: string;
}

export function fetchAdminRideImages(): Promise<AdminRideImage[]> {
  return apiRequest<AdminRideImage[]>("/admin/ride-images");
}

export function setRideImageSelectable(key: string, selectable: boolean): Promise<AdminRideImage> {
  return apiRequest<AdminRideImage>(`/admin/ride-images/${encodeURIComponent(key)}`, {
    method: "PATCH",
    body: { selectable },
  });
}

/** "Delete" is an ARCHIVE on the server: the image leaves the list and the picker, but every
 *  ride that already uses the key keeps showing it. */
export function archiveRideImage(key: string): Promise<void> {
  return apiRequest<void>(`/admin/ride-images/${encodeURIComponent(key)}`, { method: "DELETE" });
}

const ALLOWED_UPLOAD_TYPES: Record<string, true> = {
  "image/jpeg": true,
  "image/png": true,
  "image/webp": true,
};

/** Raw-bytes POST shared by upload and replace — same headers, same error shape. */
async function postImageBytes(path: string, original: File): Promise<AdminRideImage> {
  if (!ALLOWED_UPLOAD_TYPES[original.type]) {
    throw new ApiError(415, "Choose a JPEG, PNG or WebP image");
  }
  // Too big for the server's 2 MB cap? Scale it down first (never crops; the server does that).
  const file = await shrinkImageForUpload(original);
  const token = getAccessToken();
  const response = await fetch(`${config.apiUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: file,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
    throw new ApiError(response.status, body.message ?? body.error ?? "Upload failed");
  }
  const body = (await response.json()) as { data: AdminRideImage };
  return body.data;
}

/** Replace the picture behind an existing key. The key (and every ride using it) is unchanged. */
export function replaceRideImage(key: string, file: File): Promise<AdminRideImage> {
  return postImageBytes(`/admin/ride-images/${encodeURIComponent(key)}/replace`, file);
}

/**
 * Raw-bytes upload, mirroring how send() in api-client.ts builds its headers — apiRequest always
 * JSON-encodes its body, which a File is not. label/category travel as query params since a
 * raw-bytes POST has nowhere else to put them (server: schemas/rideImages.schemas.ts).
 */
export async function uploadRideImage(
  file: File,
  options: { label: string; category: string },
): Promise<AdminRideImage> {
  if (!ALLOWED_UPLOAD_TYPES[file.type]) {
    throw new ApiError(415, "Choose a JPEG, PNG or WebP image");
  }

  const params = new URLSearchParams({ label: options.label, category: options.category });
  return postImageBytes(`/admin/ride-images?${params.toString()}`, file);
}
