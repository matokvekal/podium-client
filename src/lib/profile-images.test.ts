// The gallery is a real server call, unlike the local-only preset/upload picker
// (store/userIdentityStore.ts) — see the file header in AccountPage.tsx.

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchProfileImages, selectGalleryImage } from "./profile-images";

function respondOnce(status: number, body: unknown) {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchProfileImages", () => {
  it("unwraps the { data } envelope into a plain array", async () => {
    respondOnce(200, {
      data: [
        { key: "trail-01.webp", url: "https://api.test/public-app-images/trail-01.webp" },
        { key: "trail-02.png", url: "https://api.test/public-app-images/trail-02.png" },
      ],
    });

    const images = await fetchProfileImages();
    expect(images).toEqual([
      { key: "trail-01.webp", url: "https://api.test/public-app-images/trail-01.webp" },
      { key: "trail-02.png", url: "https://api.test/public-app-images/trail-02.png" },
    ]);
  });

  it("fetches without a bearer token — the catalog is public", async () => {
    const fetchMock = respondOnce(200, { data: [] });
    await fetchProfileImages();

    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });
});

describe("selectGalleryImage", () => {
  it("PUTs the bare key and returns the server's updated profile", async () => {
    const fetchMock = respondOnce(200, {
      data: { id: 7, avatarUrl: "https://api.test/public-app-images/trail-01.webp" },
    });

    const updated = await selectGalleryImage("trail-01.webp");

    expect(updated).toEqual({ id: 7, avatarUrl: "https://api.test/public-app-images/trail-01.webp" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/users/me/avatar");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(init?.body as string)).toEqual({ galleryKey: "trail-01.webp" });
  });
});
