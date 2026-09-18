/**
 * @vitest-environment jsdom
 */

// The router half of Fast Resume: who gets moved on launch, and who must be left exactly where
// they landed.
//
// The RULE itself is tested in lib/fast-resume.test.ts, without a router. What is pinned here
// is the part that can only go wrong in a real navigation — resuming over a link the rider
// actually tapped, resuming more than once, or writing a route for someone who is not signed
// in. `fastResumeRoute` is mocked because in production it is a snapshot taken at import, and
// a test that has to reload a module to change one boolean is a test nobody will keep.

import { render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fastResumeRoute = vi.fn<() => string | null>();
const recordResumeState = vi.fn();

vi.mock("../lib/fast-resume", async () => {
  const actual = await vi.importActual<typeof import("../lib/fast-resume")>("../lib/fast-resume");
  return {
    ...actual,
    fastResumeRoute: () => fastResumeRoute(),
    recordResumeState: (...args: unknown[]) => recordResumeState(...args),
  };
});

let authStatus = "signed-in";
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ status: authStatus, profile: null }),
}));

const { FastResume } = await import("./FastResume");

/** Prints wherever the router currently is, so a redirect is visible to the test. */
function Here() {
  const location = useLocation();
  return <span data-testid="here">{`${location.pathname}${location.search}`}</span>;
}

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <FastResume />
      <Here />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authStatus = "signed-in";
  fastResumeRoute.mockReturnValue(null);
});

describe("restoring on launch", () => {
  it("opens the last route when the app launched at its start_url", async () => {
    fastResumeRoute.mockReturnValue("/events/abc");
    renderAt("/");
    expect((await screen.findByTestId("here")).textContent).toBe("/events/abc");
  });

  it("starts normally when there is nothing to resume", async () => {
    renderAt("/");
    expect((await screen.findByTestId("here")).textContent).toBe("/");
  });

  it("⚠ never moves a rider off the link they actually opened", async () => {
    // A /join or /share link IS the request. Resuming over it would drop the invitation the
    // rider tapped, which is the one thing this feature must not cost anybody.
    fastResumeRoute.mockReturnValue("/events/abc");
    renderAt("/join/19092026A");
    expect((await screen.findByTestId("here")).textContent).toBe("/join/19092026A");
  });

  it("leaves a launch that carried a query alone", async () => {
    fastResumeRoute.mockReturnValue("/events/abc");
    renderAt("/?ref=poster");
    expect((await screen.findByTestId("here")).textContent).toBe("/?ref=poster");
  });

  it("does not navigate when the last route was the home screen anyway", async () => {
    fastResumeRoute.mockReturnValue("/");
    renderAt("/");
    expect((await screen.findByTestId("here")).textContent).toBe("/");
  });
});

describe("remembering where the rider is", () => {
  it("records the current route, query included", async () => {
    renderAt("/tracks?country=IL");
    await screen.findByTestId("here");
    expect(recordResumeState).toHaveBeenCalledWith("/tracks?country=IL");
  });

  it("⚠ records nothing for a signed-out visitor", async () => {
    // Nothing to resume into, and on a shared device it would leave one person's last screen
    // waiting for the next.
    authStatus = "signed-out";
    renderAt("/tracks");
    await screen.findByTestId("here");
    expect(recordResumeState).not.toHaveBeenCalled();
  });

  it("records the route it resumed to, not the launch route", async () => {
    fastResumeRoute.mockReturnValue("/events/abc");
    renderAt("/");
    await screen.findByTestId("here");
    expect(recordResumeState).toHaveBeenLastCalledWith("/events/abc");
  });
});
