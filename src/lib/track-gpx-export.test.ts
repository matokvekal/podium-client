import { describe, expect, it } from "vitest";
import { buildGpxFile, gpxFilenameFor } from "./track-gpx";

describe("buildGpxFile", () => {
  it("writes one trkpt per route point, in order", () => {
    const gpx = buildGpxFile(
      {
        points: [
          [32.08, 34.78],
          [32.09, 34.79],
        ],
        elevations: null,
      },
      "Test Ride",
    );
    const matches = [...gpx.matchAll(/<trkpt lat="([^"]+)" lon="([^"]+)">/g)];
    expect(matches).toHaveLength(2);
    expect(matches[0][1]).toBe("32.08");
    expect(matches[0][2]).toBe("34.78");
    expect(matches[1][1]).toBe("32.09");
  });

  it("includes <ele> only where the point actually has an elevation reading", () => {
    const gpx = buildGpxFile(
      {
        points: [
          [32.08, 34.78],
          [32.09, 34.79],
        ],
        elevations: [120, null],
      },
      "Test Ride",
    );
    expect(gpx).toContain("<ele>120</ele>");
    // Exactly one <ele> tag — the null-elevation point must not invent a value.
    expect(gpx.match(/<ele>/g)).toHaveLength(1);
  });

  it("escapes XML special characters in the ride name", () => {
    const gpx = buildGpxFile({ points: [[1, 2]], elevations: null }, 'Ride & "Fun" <Loop>');
    expect(gpx).toContain("Ride &amp; &quot;Fun&quot; &lt;Loop&gt;");
    expect(gpx).not.toContain("<Loop>ride");
  });

  it("opens and closes every tag it writes, in the right order", () => {
    const gpx = buildGpxFile(
      {
        points: [
          [32.08, 34.78],
          [32.09, 34.79],
        ],
        elevations: [100, 110],
      },
      "Well Formed",
    );
    for (const tag of ["gpx", "metadata", "trk", "trkseg"]) {
      expect(gpx).toContain(`<${tag}`);
      expect(gpx).toContain(`</${tag}>`);
    }
    expect(gpx.match(/<trkpt /g)).toHaveLength(2);
    expect(gpx.match(/<\/trkpt>/g)).toHaveLength(2);
    expect(gpx.match(/<ele>/g)).toHaveLength(2);
  });

  it("handles an empty points array without producing an unclosed <trkseg>", () => {
    const gpx = buildGpxFile({ points: [], elevations: null }, "Empty");
    expect(gpx).toContain("<trkseg>");
    expect(gpx).toContain("</trkseg>");
    expect(gpx).not.toContain("<trkpt");
  });
});

describe("gpxFilenameFor", () => {
  it("slugifies the ride name", () => {
    expect(gpxFilenameFor("Sunday Morning Ride!")).toBe("sunday-morning-ride.gpx");
  });

  it("falls back to a generic name when the title is nothing but punctuation", () => {
    expect(gpxFilenameFor("!!!")).toBe("route.gpx");
  });

  it("falls back to a generic name for an empty/blank title", () => {
    expect(gpxFilenameFor("   ")).toBe("route.gpx");
  });
});
