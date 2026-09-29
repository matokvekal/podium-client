/**
 * @vitest-environment jsdom
 */

// PROMOTE on the ONE existing event card: a normal card still links to the event; a locked card
// does not, but its description's external link stays clickable and does not reach the card.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventSummary } from "../lib/local-db";

let profile: { id: number; canManagePromote?: boolean } | null = null;
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ profile }) }));

const { EventCard } = await import("./EventCard");

function ride(overrides: Partial<EventSummary> = {}): EventSummary {
  return {
    id: "e1",
    code: "C1",
    name: "Riders of Hope",
    type: "ride",
    status: "published",
    visibility: "public",
    ownerId: 5,
    startsAt: null,
    location: null,
    ...overrides,
  } as unknown as EventSummary;
}

const show = (event: EventSummary) =>
  render(
    <MemoryRouter>
      <EventCard event={event} />
    </MemoryRouter>,
  );

beforeEach(() => {
  profile = { id: 9 };
});
afterEach(cleanup);

describe("EventCard — normal event (promoteOnly false / absent)", () => {
  it("is a link to the event, exactly as before", () => {
    show(ride());
    expect(screen.getByText("Riders of Hope").closest("a")?.getAttribute("href")).toBe(
      "/events/e1",
    );
    expect(screen.queryByText("COMING SOON")).toBeNull();
  });
});

describe("EventCard — PROMOTE, normal user", () => {
  const promoted = () =>
    ride({ promoteOnly: true, description: "Registration: https://city.example/reg" });

  it("shows the card and COMING SOON, but nothing links to the event", () => {
    const { container } = show(promoted());
    expect(screen.getByText("Riders of Hope")).toBeTruthy();
    expect(screen.getByText("COMING SOON")).toBeTruthy();
    expect(container.querySelector('a[href="/events/e1"]')).toBeNull();
    expect(screen.getByText("Riders of Hope").closest("a")).toBeNull();
  });

  it("keeps the external description link clickable and does not bubble to the card", () => {
    const onCardClick = vi.fn();
    // A React handler on an ancestor stands in for the card's own click handling: React's
    // stopPropagation is what keeps the link click from reaching it.
    render(
      // biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: test double for the card click handler
      <div onClick={onCardClick}>
        <MemoryRouter>
          <EventCard event={promoted()} />
        </MemoryRouter>
      </div>,
    );
    const link = screen.getByRole("link", { name: "https://city.example/reg" });
    expect(link.getAttribute("href")).toBe("https://city.example/reg");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    fireEvent.click(link);
    expect(onCardClick).not.toHaveBeenCalled();
  });
});

describe("EventCard — PROMOTE, System Admin / owner", () => {
  it("is a normal clickable card for the System Admin", () => {
    profile = { id: 9, canManagePromote: true };
    show(ride({ promoteOnly: true, description: "x" }));
    expect(screen.getByText("Riders of Hope").closest("a")?.getAttribute("href")).toBe(
      "/events/e1",
    );
    expect(screen.queryByText("COMING SOON")).toBeNull();
  });

  it("is a normal clickable card for the event's owner", () => {
    profile = { id: 5 };
    show(ride({ promoteOnly: true }));
    expect(screen.getByText("Riders of Hope").closest("a")).not.toBeNull();
  });
});
