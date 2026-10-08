import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn();
vi.mock("./api-client", async () => ({
  ...(await vi.importActual<typeof import("./api-client")>("./api-client")),
  apiRequest: (...a: unknown[]) => apiRequest(...a),
}));

const { isRideImagePending } = await import("./ride-images-dynamic");
const { useRideImagesStore } = await import("../store/rideImagesStore");

const img = (key: string) => ({ key, url: `/api/v1/ride-image-files/${key}.webp`, label: key, category: "generic", selectable: true });

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
  it("is not pending once the fetch failed", () => {
    expect(isRideImagePending(null, "uploaded-xyz", true)).toBe(false);
  });
  it("is not pending when the loaded catalog has the key", () => {
    expect(isRideImagePending([img("uploaded-xyz")], "uploaded-xyz", false)).toBe(false);
  });

  // Prod bug 2026-10-08 ("Winner" rides): an image uploaded after this session loaded the
  // catalog drew the owner's default cover instead, until a full reload.
  it("a key the LOADED catalog lacks is pending until one re-fetch answered", () => {
    expect(isRideImagePending([img("other")], "uploaded-new", false)).toBe(true);
    expect(isRideImagePending([img("other")], "uploaded-new", false, true)).toBe(false);
  });
});

describe("rideImagesStore.refreshForMissingKey", () => {
  beforeEach(() => {
    apiRequest.mockReset();
    useRideImagesStore.setState({ images: [img("old")], loading: false, error: null, missingChecked: [] });
  });

  it("re-fetches the catalog once and then the new image resolves", async () => {
    apiRequest.mockResolvedValue([img("old"), img("uploaded-new")]);
    await useRideImagesStore.getState().refreshForMissingKey("uploaded-new");
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest).toHaveBeenCalledWith("/ride-images");
    expect(useRideImagesStore.getState().images?.map((i) => i.key)).toEqual(["old", "uploaded-new"]);
    expect(useRideImagesStore.getState().missingChecked).toEqual(["uploaded-new"]);
  });

  it("never re-fetches twice for the same key (a retired key cannot loop)", async () => {
    apiRequest.mockResolvedValue([img("old")]);
    await useRideImagesStore.getState().refreshForMissingKey("gone");
    await useRideImagesStore.getState().refreshForMissingKey("gone");
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(isRideImagePending(useRideImagesStore.getState().images, "gone", false, true)).toBe(false);
  });
});
