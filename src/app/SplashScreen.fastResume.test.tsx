/**
 * @vitest-environment jsdom
 */

// The visible half of Fast Resume: the clip does not play when the rider is coming back.
//
// Only that one decision is pinned here — the splash's own timing, video element, tinting and
// once-per-tab guard are untouched by this feature and are not this file's business. What
// matters is that the two states are exactly the app's existing ones: splash, or no splash.

import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fastResumeRoute = vi.fn<() => string | null>();

vi.mock("../lib/fast-resume", async () => {
  const actual = await vi.importActual<typeof import("../lib/fast-resume")>("../lib/fast-resume");
  return { ...actual, fastResumeRoute: () => fastResumeRoute() };
});

const { SplashScreen } = await import("./SplashScreen");

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  fastResumeRoute.mockReturnValue(null);

  // Two things jsdom does not implement that the splash uses on the path where it DOES play:
  // the reduced-motion query it asks before moving anything, and HTMLMediaElement.play. Both
  // are stubbed to their ordinary browser answers — nothing about the feature under test.
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof matchMedia;
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
});

describe("the splash on a cold start", () => {
  it("plays for a first launch, exactly as it always has", () => {
    const { container } = render(<SplashScreen />);
    expect(container.querySelector("video")).not.toBeNull();
  });

  it("⚠ is skipped entirely when the app is resuming", () => {
    fastResumeRoute.mockReturnValue("/events/abc");
    const { container } = render(<SplashScreen />);
    expect(container.querySelector(".splash")).toBeNull();
    expect(container.querySelector("video")).toBeNull();
  });

  it("still plays when Fast Resume has nothing to resume to", () => {
    // The same code path as FAST_RESUME_ENABLED being off: the snapshot is null either way,
    // which is what makes the flag restore this screen's old behaviour exactly.
    const { container } = render(<SplashScreen />);
    expect(container.querySelector("video")).not.toBeNull();
  });
});
