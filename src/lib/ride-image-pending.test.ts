import { describe, expect, it } from "vitest";
import { isRideImagePending } from "./ride-images-dynamic";

describe("isRideImagePending", () => {
  it("is pending for an uploaded key while the catalog is loading", () => {
    expect(isRideImagePending(null, "uploaded-xyz", false)).toBe(true);
  });
  it("is not pending when there is no key", () => {
    expect(isRideImagePending(null, null, false)).toBe(false);
  });
  it("is not pending for a key the compiled list knows", () => {
    expect(isRideImagePending(null, "tikva1", false)).toBe(false);
  });
  it("is not pending once the catalog arrived or the fetch failed", () => {
    expect(isRideImagePending([], "uploaded-xyz", false)).toBe(false);
    expect(isRideImagePending(null, "uploaded-xyz", true)).toBe(false);
  });
});
