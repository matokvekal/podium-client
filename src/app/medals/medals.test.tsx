/**
 * @vitest-environment jsdom
 */

// Event Completion Medals (sql/061) on the client: the dedication rule, the background tables,
// the Past Ride 🏅, the collection, and the picker.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn();
vi.mock("../../lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api-client")>("../../lib/api-client");
  return { ...actual, apiRequest: (...a: unknown[]) => apiRequest(...a) };
});
const applyProfile = vi.fn();
let profile: Record<string, unknown> = { id: 7, unseenMedalCount: 0 };
vi.mock("../../auth/AuthContext", () => ({
  useAuth: () => ({ status: "signed-in", profile, applyProfile }),
}));

import { countWords } from "../../lib/medal";
import {
  DEFAULT_MEDAL_COLOR,
  DEFAULT_MEDAL_STYLE,
  MEDAL_COLORS,
  MEDAL_STYLES,
  medalBackgroundVars,
} from "../../lib/medal-backgrounds";
import type { EventSummary } from "../../lib/local-db";
import { useMedalsStore } from "../../store/medalsStore";
import { validateCreateEventForm } from "../../validation/forms";
import { EventCard } from "../EventCard";
import { EventMedalsSection } from "./EventMedalsSection";
import { MedalBackgroundPicker } from "./MedalBackgroundPicker";

const MEDAL = {
  eventId: "e1",
  eventTitle: "רוכבים בתקווה",
  eventDate: "2026-10-04T05:00:00.000Z",
  medalText: "עיריית פתח תקווה שמחה להעניק לך מדליית הוקרה",
  awardedAt: "2026-10-05T05:00:00.000Z",
  seen: false,
  cursor: "c1",
};

beforeEach(() => {
  apiRequest.mockReset();
  applyProfile.mockReset();
  profile = { id: 7, unseenMedalCount: 0 };
  useMedalsStore.getState().reset();
});
afterEach(cleanup);

describe("dedication rule", () => {
  const base = { name: "Ride", startsAt: "", hasRoute: true, isEditing: true, description: "" };
  const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

  it("medal off: any dedication is ignored", () => {
    expect(validateCreateEventForm({ ...base, medalEnabled: false, medalText: words(50) }).ok).toBe(true);
  });
  it("medal on: required, and at most 30 words (Hebrew counted the same)", () => {
    expect(validateCreateEventForm({ ...base, medalEnabled: true, medalText: "  " }).errors.medalText).toBeTruthy();
    expect(validateCreateEventForm({ ...base, medalEnabled: true, medalText: words(30) }).ok).toBe(true);
    expect(validateCreateEventForm({ ...base, medalEnabled: true, medalText: words(31) }).errors.medalText).toMatch(/30 words/);
    expect(countWords("שלום  לכם\nרוכבים")).toBe(3);
  });
});

describe("backgrounds", () => {
  it("20 colours × 10 styles, unique ids", () => {
    expect(new Set(MEDAL_COLORS.map((c) => c.id)).size).toBe(20);
    expect(new Set(MEDAL_STYLES.map((s) => s.id)).size).toBe(10);
  });
  it("missing or unknown ids fall back to the original look", () => {
    const original = medalBackgroundVars(DEFAULT_MEDAL_COLOR, DEFAULT_MEDAL_STYLE);
    expect(medalBackgroundVars(undefined, undefined)).toEqual(original);
    expect(medalBackgroundVars("nope", "nope")).toEqual(original);
  });
  it("picker: choosing a colour and a style reports both ids", () => {
    const onChange = vi.fn();
    render(<MedalBackgroundPicker colorId="classic" styleId="glow" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Navy" }));
    expect(onChange).toHaveBeenLastCalledWith({ colorId: "navy", styleId: "glow" });
    fireEvent.click(screen.getByRole("radio", { name: /Sunburst/ }));
    expect(onChange).toHaveBeenLastCalledWith({ colorId: "classic", styleId: "sunburst" });
  });
});

function LocationProbe() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname + loc.search}</p>;
}

describe("Past Ride card 🏅", () => {
  const ride = (over: Partial<EventSummary>) =>
    ({ id: "e1", code: "C", name: "Ride", status: "finished", visibility: "public", startsAt: "2026-10-04T05:00:00.000Z", ...over }) as unknown as EventSummary;

  it("no icon unless this rider was awarded the medal", () => {
    render(<MemoryRouter><EventCard event={ride({})} /></MemoryRouter>);
    expect(screen.queryByTestId("card-medal")).toBeNull();
  });

  it("icon opens that medal in Achievements, not the ride", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="*" element={<><EventCard event={ride({ myMedal: true })} /><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /View your medal for Ride/ }));
    expect(screen.getByTestId("where").textContent).toBe("/stats/achievements?tab=medals&medal=e1");
  });
});

describe("medal collection", () => {
  it("renders the medals newest first with RTL dedication and a NEW ribbon", async () => {
    apiRequest.mockResolvedValueOnce({ medals: [MEDAL], nextCursor: null, total: 1, unseen: 1 });
    render(<MemoryRouter><EventMedalsSection /></MemoryRouter>);
    expect(await screen.findByText("רוכבים בתקווה")).toBeTruthy();
    expect(screen.getByText(MEDAL.medalText).getAttribute("dir")).toBe("rtl");
    expect(screen.getByText("NEW")).toBeTruthy();
    expect(screen.getByText("EVENT COMPLETION MEDAL")).toBeTruthy();
  });

  it("a failure only says so in this section", async () => {
    apiRequest.mockRejectedValueOnce(new Error("down"));
    render(<MemoryRouter><EventMedalsSection /></MemoryRouter>);
    expect(await screen.findByText(/Couldn't load your medals/)).toBeTruthy();
  });

  it("viewing marks the unseen medals seen and clears the unread count", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    profile = { id: 7, unseenMedalCount: 1 };
    apiRequest
      .mockResolvedValueOnce({ medals: [MEDAL], nextCursor: null, total: 1, unseen: 1 })
      .mockResolvedValueOnce({ marked: 1 });
    render(<MemoryRouter><EventMedalsSection /></MemoryRouter>);
    await screen.findByText("רוכבים בתקווה");
    await vi.advanceTimersByTimeAsync(1600);
    expect(apiRequest).toHaveBeenCalledWith("/medals/me/seen", { method: "POST", body: { eventIds: ["e1"] } });
    expect(applyProfile).toHaveBeenCalledWith(expect.objectContaining({ unseenMedalCount: 0 }));
    vi.useRealTimers();
  });
});
