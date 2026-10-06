// A track's flyover video (server: sql/058-route-videos.sql, services/routeVideo.service.ts).
//
// One short video per TRACK (routes.id), shown on every ride built on that track to logged-in
// riders. Only the track's owner may add, replace or remove it.
//
// Upload is its own fetch, for the same reason admin-ride-images.ts's is: the body is the raw
// file with its own Content-Type, not JSON. Playback fetches the bytes with the bearer token
// (apiRequestBlob) and hands the <video> an object URL — a plain <video src> could not send the
// token, and the file endpoint requires a login.

import { ApiError, apiRequest, apiRequestBlob } from "./api-client";
import { getAccessToken } from "./auth-storage";
import { config } from "./config";

export const ROUTE_VIDEO_MAX_BYTES = 2 * 1024 * 1024; // must match the server's config/route-videos.ts

/** By MIME type, plus by extension for browsers that leave File.type empty (some Android pickers). */
const ALLOWED_TYPES: Record<string, string> = {
  "video/mp4": "video/mp4",
  "video/webm": "video/webm",
  "video/quicktime": "video/quicktime",
};
const ALLOWED_EXTENSIONS: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

export const ROUTE_VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime,.mp4,.m4v,.webm,.mov";

export interface RouteVideoInfo {
  durationS: number | null;
  updatedAt: string;
}

/** GET /events/:eventId/route/video — the ride's track and its video, if any. */
export interface EventRouteVideo {
  routeId: number;
  ownerId: number | null;
  video: RouteVideoInfo | null;
}

/** "0:42", "1:05", "12:00". Null/invalid → null (the button then shows no length). */
export function formatVideoDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The Content-Type to send for this file, or null when it is not a video we accept. */
export function routeVideoContentType(file: Pick<File, "name" | "type">): string | null {
  if (ALLOWED_TYPES[file.type]) return ALLOWED_TYPES[file.type];
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_EXTENSIONS[ext] ?? null;
}

/** A rider-facing reason this file cannot be uploaded, or null when it is fine. */
export function validateRouteVideo(file: Pick<File, "name" | "type" | "size">): string | null {
  if (!routeVideoContentType(file)) return "Choose an MP4, MOV or WebM video";
  if (file.size > ROUTE_VIDEO_MAX_BYTES) {
    return `Video is ${formatMb(file.size)} — max ${formatMb(ROUTE_VIDEO_MAX_BYTES)}`;
  }
  if (file.size === 0) return "That video file is empty";
  return null;
}

/** The video's length in seconds, read by the browser from the file itself. Null when the
 *  browser cannot read it (an unsupported codec) — the upload still goes ahead without a length. */
export function readVideoDuration(file: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    const done = (value: number | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      resolve(value);
    };
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () =>
      done(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null);
    video.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    video.src = url;
  });
}

export function fetchEventRouteVideo(eventId: string): Promise<EventRouteVideo | null> {
  return apiRequest<EventRouteVideo | null>(`/events/${encodeURIComponent(eventId)}/route/video`);
}

export async function uploadRouteVideo(routeId: number, file: File): Promise<RouteVideoInfo> {
  const problem = validateRouteVideo(file);
  const contentType = routeVideoContentType(file);
  if (problem || !contentType) throw new ApiError(415, problem ?? "Unsupported video");
  const duration = await readVideoDuration(file);
  const query = duration != null ? `?durationS=${Math.round(duration)}` : "";
  const token = getAccessToken();
  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}/routes/${routeId}/video${query}`, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: file,
    });
  } catch {
    throw new ApiError(0, "Could not reach the server — the video was not uploaded");
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
    throw new ApiError(response.status, body.message ?? body.error ?? "Video upload failed");
  }
  const body = (await response.json()) as { data: RouteVideoInfo };
  return body.data;
}

export function deleteRouteVideo(routeId: number): Promise<void> {
  return apiRequest<void>(`/routes/${routeId}/video`, { method: "DELETE" });
}

/** An object URL for playback — the caller MUST revokeObjectURL it when done. Null = no video. */
export async function fetchRouteVideoUrl(routeId: number): Promise<string | null> {
  const file = await apiRequestBlob(`/routes/${routeId}/video`);
  return file ? URL.createObjectURL(file.blob) : null;
}
