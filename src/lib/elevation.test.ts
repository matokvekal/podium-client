import { describe, expect, it } from "vitest";
import { elevationGainFromSeries, elevationSeriesOrNull } from "./elevation";

// The GPX/CSV parsers that feed this need a DOM (DOMParser) which this repo deliberately has
// no jsdom for — see lib/image-processing.test.ts. The gain algorithm itself is pure, and it
// is what decides the number a rider sees, so that is what is covered here.

describe("elevationGainFromSeries", () => {
  it("returns null with no usable samples", () => {
    expect(elevationGainFromSeries([])).toBeNull();
    expect(elevationGainFromSeries([null, null, undefined])).toBeNull();
    expect(elevationGainFromSeries([100])).toBeNull();
  });

  it("sums only the uphill sections — a loop back to the start still has real climb", () => {
    expect(elevationGainFromSeries([0, 50, 100, 50, 0])).toBe(100);
  });

  it("ignores sub-threshold GPS jitter", () => {
    expect(elevationGainFromSeries([100, 102, 99, 101, 98, 100])).toBe(0);
  });

  it("counts a sustained climb through the jitter", () => {
    expect(elevationGainFromSeries([0, 2, 8, 10, 9, 20, 21, 35])).toBe(35);
  });

  it("skips gaps (null elevations) rather than treating them as zero", () => {
    expect(elevationGainFromSeries([0, null, 40, null, 80])).toBe(80);
  });
});

// The same values, kept rather than summed — this is what the elevation profile is drawn from.
describe("elevationSeriesOrNull", () => {
  it("returns the series when the file carried elevation", () => {
    expect(elevationSeriesOrNull([10, 20, 30])).toEqual([10, 20, 30]);
  });

  it("keeps gaps as nulls, in place, so the series stays aligned with its points", () => {
    expect(elevationSeriesOrNull([10, null, 30])).toEqual([10, null, 30]);
    expect(elevationSeriesOrNull([10, undefined, 30])).toEqual([10, null, 30]);
  });

  it("normalizes an unusable value to a gap rather than passing NaN on to be drawn", () => {
    expect(elevationSeriesOrNull([10, Number.NaN, Number.POSITIVE_INFINITY, 40])).toEqual([
      10,
      null,
      null,
      40,
    ]);
  });

  it("returns null when there is nothing to draw — no elevation is not a flat route", () => {
    expect(elevationSeriesOrNull([])).toBeNull();
    expect(elevationSeriesOrNull([null, null, null])).toBeNull();
    expect(elevationSeriesOrNull([100])).toBeNull();
    expect(elevationSeriesOrNull([100, null])).toBeNull();
  });
});
