import { describe, expect, it } from "vitest";
import { filenameFromContentDisposition } from "./track-gpx";

describe("filenameFromContentDisposition", () => {
  it("prefers the UTF-8 form, so a Hebrew name survives", () => {
    const name = "סינגל כרמל.gpx";
    const header = `attachment; filename="route-42.gpx"; filename*=UTF-8''${encodeURIComponent(name)}`;
    expect(filenameFromContentDisposition(header)).toBe(name);
  });

  it("falls back to the plain filename", () => {
    expect(filenameFromContentDisposition('attachment; filename="route-42.gpx"')).toBe(
      "route-42.gpx",
    );
    expect(filenameFromContentDisposition("attachment; filename=route-7.gpx")).toBe("route-7.gpx");
  });

  it("is null when there is nothing to read", () => {
    expect(filenameFromContentDisposition(null)).toBeNull();
    expect(filenameFromContentDisposition("attachment")).toBeNull();
  });

  it("ignores a malformed UTF-8 escape rather than throwing", () => {
    expect(
      filenameFromContentDisposition(`attachment; filename="a.gpx"; filename*=UTF-8''%E0%A4%A`),
    ).toBe("a.gpx");
  });
});
