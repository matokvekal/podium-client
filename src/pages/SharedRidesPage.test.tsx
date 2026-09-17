/**
 * @vitest-environment jsdom
 */

// The chooser a shared link opens.
//
// Four properties, each of which is the feature rather than a detail of it:
//
//   1. NOTHING IS PRE-SELECTED. Every ride gets a card and the reader picks. A page that
//      defaulted to one of them would be the single-ride link it replaced.
//   2. PICKING HANDS OFF TO /join/:code. This page must never grow its own join, bib or
//      approval logic — that lives in JoinPage and has to keep exactly one implementation.
//   3. A GROUP OF ONE REDIRECTS. Groups shrink (a ride removed, a ride finished), and a link
//      from last week that now resolves to one ride has to behave like the plain invitation it
//      effectively is.
//   4. SWITCHING SAYS IT MOVES YOU, BEFORE IT DOES. Leaving a ride is not what "switch"
//      obviously means, and the organizer's head-count depends on it actually happening.
//
// api-client is mocked, so nothing here reaches the network; Leaflet is never mounted because
// no route geometry is served to these cards. Clicks use fireEvent rather than user-event,
// which is not a dependency of this project — the whole card is a <button>, so a click on the
// ride name bubbles to it exactly as a tap does.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn();
const navigate = vi.fn();

vi.mock("../lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("../lib/api-client")>("../lib/api-client");
  return { ...actual, apiRequest: (...args: unknown[]) => apiRequest(...args) };
});

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

// The page reads the viewer's joined rides out of the store and their identity out of the auth
// context; both are stubbed so each test can say plainly who is looking.
const joinedRideIds: string[] = [];
const loadMyRides = vi.fn();
vi.mock("../store/eventsStore", () => ({
  useEventsStore: (selector: (state: unknown) => unknown) =>
    selector({ joinedRideIds, loadMyRides }),
}));

let authStatus = "signed-out";
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ status: authStatus, profile: null }),
}));

const { SharedRidesPage } = await import("./SharedRidesPage");

function ride(overrides: Record<string, unknown> = {}) {
  return {
    id: "long",
    code: "19092026A",
    name: "Long loop",
    type: "RIDE",
    status: "published",
    visibility: "public",
    displayMode: "standard",
    startsAt: new Date(2026, 8, 19, 7, 0).toISOString(),
    endsAt: null,
    location: "Park HaYarkon",
    ownerId: 7,
    ownerName: "Dan Cohen",
    ownerAvatarUrl: null,
    distanceKm: 120,
    elevationGain: 1200,
    participantCount: 14,
    ...overrides,
  };
}

const LONG = ride();
const SHORT = ride({
  id: "short",
  code: "19092026B",
  name: "Short loop",
  startsAt: new Date(2026, 8, 19, 7, 30).toISOString(),
  distanceKm: 60,
  elevationGain: 400,
  participantCount: 6,
});

/** Answers the group read, and treats every per-card route fetch as "no track". */
function serveGroup(rides: Record<string, unknown>[], owner = { id: 7, name: "Dan Cohen" }) {
  apiRequest.mockImplementation(async (path: string) => {
    if (path.startsWith("/events/share/")) return { linkGroupId: "g1", owner, rides };
    if (path.includes("/route")) return null;
    return undefined;
  });
}

function renderPage(codes = "19092026A-19092026B") {
  return render(
    <MemoryRouter initialEntries={[`/share/${codes}`]}>
      <Routes>
        <Route path="/share/:codes" element={<SharedRidesPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  joinedRideIds.length = 0;
  authStatus = "signed-out";
});

describe("the chooser", () => {
  it("names the organizer and how many rides they created", async () => {
    serveGroup([LONG, SHORT]);
    renderPage();
    expect(await screen.findByText(/Dan Cohen created 2 rides/)).toBeTruthy();
  });

  it("asks the question rather than answering it", async () => {
    serveGroup([LONG, SHORT]);
    renderPage();
    expect(await screen.findByText(/Which one are you riding\?/)).toBeTruthy();
  });

  it("renders one card per ride", async () => {
    serveGroup([LONG, SHORT]);
    renderPage();
    expect(await screen.findByText("Long loop")).toBeTruthy();
    expect(screen.getByText("Short loop")).toBeTruthy();
  });

  it("⚠ pre-selects nothing — every card offers the same choice", async () => {
    serveGroup([LONG, SHORT]);
    renderPage();
    await screen.findByText("Long loop");
    const ctas = screen.getAllByText("Choose this ride");
    expect(ctas).toHaveLength(2);
    // No "you're in", no selected state, nothing auto-navigated.
    expect(screen.queryByText("You're in")).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("shows each ride's own time and distance, which is what the reader is choosing between", async () => {
    serveGroup([LONG, SHORT]);
    renderPage();
    await screen.findByText("Long loop");
    expect(screen.getByText("120 km")).toBeTruthy();
    expect(screen.getByText("60 km")).toBeTruthy();
  });

  it("handles three rides", async () => {
    serveGroup([LONG, SHORT, ride({ id: "gravel", code: "19092026C", name: "Gravel" })]);
    renderPage();
    expect(await screen.findByText(/created 3 rides/)).toBeTruthy();
    expect(screen.getByText("Gravel")).toBeTruthy();
  });
});

describe("picking a ride", () => {
  it("⚠ hands off to /join/:code — it never joins anything itself", async () => {
    serveGroup([LONG, SHORT]);
    renderPage();
    await screen.findByText("Short loop");

    fireEvent.click(screen.getByText("Short loop"));

    expect(navigate).toHaveBeenCalledWith("/join/19092026B");
    // Nothing was POSTed: no join, no leave, no membership invented here.
    const methods = apiRequest.mock.calls.map((call) => (call[1] as { method?: string })?.method);
    expect(methods.every((method) => method === undefined)).toBe(true);
  });

  it("carries ?via=qr through, so the greeting still knows this was a scan", async () => {
    serveGroup([LONG, SHORT]);
    render(
      <MemoryRouter initialEntries={["/share/19092026A-19092026B?via=qr"]}>
        <Routes>
          <Route path="/share/:codes" element={<SharedRidesPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText("Short loop");

    fireEvent.click(screen.getByText("Short loop"));

    expect(navigate).toHaveBeenCalledWith("/join/19092026B?via=qr");
  });
});

describe("a group that has shrunk to one ride", () => {
  it("⚠ redirects to the plain invitation it effectively is", async () => {
    serveGroup([LONG]);
    renderPage("19092026A-19092026B");

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/join/19092026A", { replace: true }),
    );
    // And does not also render a chooser with one card on it.
    expect(screen.queryByText(/Which one are you riding\?/)).toBeNull();
  });
});

describe("switching ride", () => {
  beforeEach(() => {
    authStatus = "signed-in";
    joinedRideIds.push("long");
  });

  it("marks the ride the reader is already on", async () => {
    serveGroup([LONG, SHORT]);
    renderPage();
    expect(await screen.findByText("You're in")).toBeTruthy();
  });

  it("⚠ says it will move them off the other ride, before anything happens", async () => {
    serveGroup([LONG, SHORT]);
    renderPage();
    await screen.findByText("Short loop");

    fireEvent.click(screen.getByText("Short loop"));

    expect(await screen.findByText(/takes you off it/)).toBeTruthy();
    // Nothing done yet — this is a question, not a progress message.
    expect(navigate).not.toHaveBeenCalled();
    const leaveCalls = apiRequest.mock.calls.filter((call) => String(call[0]).includes("/leave"));
    expect(leaveCalls).toHaveLength(0);
  });

  it("leaves the first ride and then opens the second, in that order", async () => {
    serveGroup([LONG, SHORT]);
    renderPage();
    await screen.findByText("Short loop");
    fireEvent.click(screen.getByText("Short loop"));
    await screen.findByText(/takes you off it/);

    fireEvent.click(screen.getByText(/Move me to Short loop/));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith("/events/long/leave", { method: "POST" }),
    );
    expect(navigate).toHaveBeenCalledWith("/join/19092026B");
  });

  it("changes nothing when they decide to stay", async () => {
    serveGroup([LONG, SHORT]);
    renderPage();
    await screen.findByText("Short loop");
    fireEvent.click(screen.getByText("Short loop"));
    await screen.findByText(/takes you off it/);

    fireEvent.click(screen.getByText(/Stay on Long loop/));

    expect(apiRequest.mock.calls.filter((call) => String(call[0]).includes("/leave"))).toHaveLength(
      0,
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("opening the ride they are already on is not a move", async () => {
    serveGroup([LONG, SHORT]);
    renderPage();
    await screen.findByText("Long loop");

    fireEvent.click(screen.getByText("Long loop"));

    expect(navigate).toHaveBeenCalledWith("/join/19092026A");
    expect(screen.queryByText(/takes you off it/)).toBeNull();
  });
});

describe("when the link does not resolve", () => {
  it("says the link is dead rather than showing an empty chooser", async () => {
    const { ApiError } = await import("../lib/api-client");
    apiRequest.mockRejectedValue(new ApiError(404, "No rides found for that link"));
    renderPage();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText(/Which one are you riding\?/)).toBeNull();
  });
});
