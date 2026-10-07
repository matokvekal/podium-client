/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchRouteVideoUrl = vi.fn();
vi.mock("../lib/route-video", async (orig) => ({
  ...(await orig<typeof import("../lib/route-video")>()),
  fetchRouteVideoUrl: (...a: unknown[]) => fetchRouteVideoUrl(...a),
}));

const { RouteVideoOverlay } = await import("./RouteVideoOverlay");

const revoke = vi.fn();

beforeEach(() => {
  fetchRouteVideoUrl.mockReset();
  revoke.mockReset();
  URL.revokeObjectURL = revoke;
  // jsdom has no media playback.
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
  HTMLMediaElement.prototype.pause = vi.fn();
  window.history.replaceState(null, "");
});

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

async function open(onClose = vi.fn()) {
  fetchRouteVideoUrl.mockResolvedValue("blob:video-1");
  render(<RouteVideoOverlay routeId={7} title="Latrun loop" durationS={42} onClose={onClose} />);
  await act(async () => {});
  return onClose;
}

describe("RouteVideoOverlay", () => {
  it("opens full screen with the title, length and a playing video", async () => {
    await open();
    expect(fetchRouteVideoUrl).toHaveBeenCalledWith(7);
    expect(screen.getByRole("dialog", { name: /Latrun loop/ })).toBeTruthy();
    expect(screen.getByText("0:42")).toBeTruthy();
    expect(document.querySelector("video")?.getAttribute("src")).toBe("blob:video-1");
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close video" }));
  });

  it("the X closes it (through history, so Back does the same)", async () => {
    const onClose = await open();
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    fireEvent.click(screen.getByRole("button", { name: "Close video" }));
    expect(back).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    back.mockRestore();
  });

  it("Escape closes it", async () => {
    const onClose = await open();
    window.history.replaceState(null, ""); // as if our entry were already gone
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("revokes the object URL when it closes", async () => {
    fetchRouteVideoUrl.mockResolvedValue("blob:video-2");
    const { unmount } = render(<RouteVideoOverlay routeId={7} title="x" onClose={vi.fn()} />);
    await act(async () => {});
    unmount();
    expect(revoke).toHaveBeenCalledWith("blob:video-2");
  });

  it("shows an error with Retry when the video is gone", async () => {
    fetchRouteVideoUrl.mockResolvedValueOnce(null).mockResolvedValueOnce("blob:video-3");
    render(<RouteVideoOverlay routeId={7} title="x" onClose={vi.fn()} />);
    await act(async () => {});
    expect(screen.getByRole("alert").textContent).toMatch(/no longer available/);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await act(async () => {});
    expect(document.querySelector("video")?.getAttribute("src")).toBe("blob:video-3");
  });

  it("a corrupt / unplayable file shows a message instead of a black frame", async () => {
    await open();
    const video = document.querySelector("video");
    if (!video) throw new Error("no video element");
    fireEvent.error(video);
    expect(screen.getByRole("alert").textContent).toMatch(/can't be played/);
    expect(screen.getByRole("button", { name: "Close video" })).toBeTruthy();
  });

  it("a failed download shows an error, never throws", async () => {
    fetchRouteVideoUrl.mockRejectedValue(new Error("500"));
    render(<RouteVideoOverlay routeId={7} title="x" onClose={vi.fn()} />);
    await act(async () => {});
    expect(screen.getByRole("alert").textContent).toMatch(/Couldn't load the video/);
  });
});
