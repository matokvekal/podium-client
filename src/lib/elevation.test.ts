import { describe, expect, it } from "vitest";
import { elevationGainFromSeries } from "./elevation";

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
