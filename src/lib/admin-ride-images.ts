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

export interface AdminRideImage {
  key: string;
  url: string;
  label: string;
  category: string;
  selectable: boolean;
  source: "static" | "upload";
  createdAt: string;
}

export function fetchAdminRideImages(): Promise<AdminRideImage[]> {
  return apiRequest<AdminRideImage[]>("/admin/ride-images");
}

export function setRideImageSelectable(
  key: string,
  selectable: boolean,
): Promise<AdminRideImage> {
  return apiRequest<AdminRideImage>(`/admin/ride-images/${encodeURIComponent(key)}`, {
    method: "PATCH",
    body: { selectable },
  });
}

export function deleteRideImage(key: string): Promise<void> {
  return apiRequest<void>(`/admin/ride-images/${encodeURIComponent(key)}`, { method: "DELETE" });
}

const ALLOWED_UPLOAD_TYPES: Record<string, true> = {
  "image/jpeg": true,
  "image/png": true,
  "image/webp": true,
};

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
  const token = getAccessToken();
  const response = await fetch(`${config.apiUrl}/admin/ride-images?${params.toString()}`, {
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
