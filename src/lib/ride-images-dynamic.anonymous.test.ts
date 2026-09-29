// Anonymous visitor: a public ride whose rideImageKey is an ADMIN-UPLOADED cover must resolve to
// its picture. The catalog is fetched with no token (server: GET /ride-images is public); when the
// fetch fails the compiled list knows nothing about an uploaded key, which is the bug this pins.

import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn();
vi.mock("./api-client", () => ({ apiRequest: (...a: unknown[]) => apiRequest(...a) }));

const { useRideImagesStore } = await import("../store/rideImagesStore");
const { resolveRideImage } = await import("./ride-images-dynamic");

const CATALOG = [
  {
    key: "upload-1a2b3c4d5e6f7890",
    url: "/api/v1/ride-image-files/0123456789abcdef.webp?v=3",
    label: "Uploaded",
    category: "generic",
    selectable: true,
    version: 3,
  },
  {
    key: "upload-archived0000000",
    url: "/api/v1/ride-image-files/fedcba9876543210.webp",
    label: "Retired",
    category: "generic",
    selectable: false,
    version: 1,
  },
];

beforeEach(() => {
  apiRequest.mockReset();
  useRideImagesStore.setState({ images: null, loading: false, error: null });
});

describe("anonymous ride-image resolution", () => {
  it("loads the catalog from the public endpoint, then resolves an uploaded (versioned) key", async () => {
    apiRequest.mockResolvedValue(CATALOG);
    await useRideImagesStore.getState().ensureLoaded();
    expect(apiRequest).toHaveBeenCalledWith("/ride-images");

    const image = resolveRideImage(useRideImagesStore.getState().images, "upload-1a2b3c4d5e6f7890");
    expect(image?.src).toBe("/api/v1/ride-image-files/0123456789abcdef.webp?v=3");
  });

  it("still resolves an archived / disabled key an existing ride references", async () => {
    apiRequest.mockResolvedValue(CATALOG);
    await useRideImagesStore.getState().ensureLoaded();
    const image = resolveRideImage(useRideImagesStore.getState().images, "upload-archived0000000");
    expect(image?.src).toBe("/api/v1/ride-image-files/fedcba9876543210.webp");
    expect(image?.selectable).toBe(false);
  });

  it("without the catalog (the old 401 case) an uploaded key cannot resolve — the symptom", async () => {
    apiRequest.mockRejectedValue(new Error("401"));
    await useRideImagesStore.getState().ensureLoaded();
    expect(resolveRideImage(useRideImagesStore.getState().images, "upload-1a2b3c4d5e6f7890")).toBeNull();
  });

  it("legacy static keys resolve from the compiled list before the catalog arrives", () => {
    expect(resolveRideImage(null, "tikva1")?.src).toBeTruthy();
  });
});
