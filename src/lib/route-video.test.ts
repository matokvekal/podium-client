import { describe, expect, it } from "vitest";
import {
  formatVideoDuration,
  ROUTE_VIDEO_MAX_BYTES,
  routeVideoContentType,
  validateRouteVideo,
} from "./route-video";

describe("formatVideoDuration", () => {
  it("formats m:ss", () => {
    expect(formatVideoDuration(42)).toBe("0:42");
    expect(formatVideoDuration(65)).toBe("1:05");
    expect(formatVideoDuration(41.6)).toBe("0:42");
    expect(formatVideoDuration(720)).toBe("12:00");
  });

  it("has no length to show for missing / nonsense values", () => {
    expect(formatVideoDuration(null)).toBeNull();
    expect(formatVideoDuration(undefined)).toBeNull();
    expect(formatVideoDuration(0)).toBeNull();
    expect(formatVideoDuration(Number.NaN)).toBeNull();
  });
});

describe("routeVideoContentType", () => {
  it("trusts a known MIME type, else falls back to the extension", () => {
    expect(routeVideoContentType({ name: "a.bin", type: "video/mp4" })).toBe("video/mp4");
    expect(routeVideoContentType({ name: "ride.MOV", type: "" })).toBe("video/quicktime");
    expect(routeVideoContentType({ name: "ride.webm", type: "" })).toBe("video/webm");
    expect(routeVideoContentType({ name: "ride.avi", type: "video/x-msvideo" })).toBeNull();
  });
});

describe("validateRouteVideo", () => {
  it("accepts a small mp4", () => {
    expect(validateRouteVideo({ name: "a.mp4", type: "video/mp4", size: 1_500_000 })).toBeNull();
  });

  it("says how big it is and what the limit is", () => {
    expect(
      validateRouteVideo({
        name: "a.mp4",
        type: "video/mp4",
        size: ROUTE_VIDEO_MAX_BYTES + 1_400_000,
      }),
    ).toBe("Video is 3.3 MB — max 2.0 MB");
  });

  it("refuses non-videos and empty files", () => {
    expect(validateRouteVideo({ name: "a.jpg", type: "image/jpeg", size: 10 })).toBe(
      "Choose an MP4, MOV or WebM video",
    );
    expect(validateRouteVideo({ name: "a.mp4", type: "video/mp4", size: 0 })).toBe(
      "That video file is empty",
    );
  });
});
