/**
 * @vitest-environment jsdom
 */

// The chat icon (and its unread badge) on a ride card: shown for a ride the rider can chat in,
// hidden when the owner switched chat off (server sql/056) — even if a stale unread summary for
// that ride is still in the store.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ status: "signed-in", profile: { id: 7 } }),
}));

import type { EventSummary } from "../lib/local-db";
import { useRideChatStore } from "../store/rideChatStore";
import { EventCard } from "./EventCard";

const RIDE = "11111111-2222-3333-4444-555555555555";

function card(overrides: Partial<EventSummary> = {}) {
  const event = {
    id: RIDE,
    code: "C1",
    name: "Saturday ride",
    status: "published",
    visibility: "public",
    startsAt: "2026-10-10T04:00:00.000Z",
    ...overrides,
  } as unknown as EventSummary;
  return render(
    <MemoryRouter>
      <EventCard event={event} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  useRideChatStore.setState({
    lastRead: {},
    summaries: { [RIDE]: { rideId: RIDE, latestId: 9, unread: 3 } },
  });
});
afterEach(cleanup);

describe("EventCard chat icon", () => {
  it("existing ride (no chatEnabled field): icon and unread badge show, as before", () => {
    card();
    expect(screen.getByRole("button", { name: /Ride chat, 3 unread/ })).toBeTruthy();
  });

  it("chatEnabled=true: icon and badge show", () => {
    card({ chatEnabled: true });
    expect(screen.getByRole("button", { name: /Ride chat, 3 unread/ })).toBeTruthy();
  });

  it("chatEnabled=false: no chat icon and no unread badge, even with a stale summary", () => {
    card({ chatEnabled: false });
    expect(screen.queryByRole("button", { name: /Ride chat/ })).toBeNull();
    expect(screen.queryByText("3")).toBeNull();
  });

  it("chat is independent of PROMOTE: promoteOnly with chat ON still shows it, with chat OFF hides it", () => {
    card({ promoteOnly: true, chatEnabled: true });
    expect(screen.getByRole("button", { name: /Ride chat/ })).toBeTruthy();
    cleanup();
    card({ promoteOnly: true, chatEnabled: false });
    expect(screen.queryByRole("button", { name: /Ride chat/ })).toBeNull();
  });
});

describe("EventCard Share (PROMOTE only)", () => {
  it("PROMOTE ride shows Share whether chat is on or off", () => {
    card({ promoteOnly: true, chatEnabled: true });
    expect(screen.getByRole("button", { name: "Share this event" })).toBeTruthy();
    cleanup();
    card({ promoteOnly: true, chatEnabled: false });
    expect(screen.getByRole("button", { name: "Share this event" })).toBeTruthy();
  });

  it("ordinary ride is unchanged: no Share on the card", () => {
    card();
    expect(screen.queryByRole("button", { name: "Share this event" })).toBeNull();
  });

  it("finished PROMOTE ride has no Share", () => {
    card({ promoteOnly: true, status: "finished" });
    expect(screen.queryByRole("button", { name: "Share this event" })).toBeNull();
  });

  it("tapping Share opens the sheet and cancels the card link (no navigation)", async () => {
    card({ promoteOnly: true });
    // fireEvent returns false when a handler called preventDefault — which is what stops the
    // surrounding <Link> from navigating into the event.
    const notPrevented = fireEvent.click(screen.getByRole("button", { name: "Share this event" }));
    expect(notPrevented).toBe(false);
    expect((await screen.findAllByText(/QR|link/i, {}, { timeout: 3000 })).length).toBeGreaterThan(
      0,
    );
  });
});
