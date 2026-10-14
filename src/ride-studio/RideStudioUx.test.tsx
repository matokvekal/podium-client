// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RideImageDto } from "../store/rideImagesStore";

const apiMutate = vi.fn();
const apiRequest = vi.fn();
let profile: Record<string, unknown> | null = { id: 7, canOrganize: true, country: "US" };

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ status: "signed-in", profile }),
}));

vi.mock("../lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("../lib/api-client")>("../lib/api-client");
  return {
    ...actual,
    apiMutate: (...a: unknown[]) => apiMutate(...a),
    apiRequest: (...a: unknown[]) => apiRequest(...a),
  };
});

const catalog: RideImageDto[] = [
  {
    key: "road-a",
    url: "/ride-images/road-a.webp",
    label: "Road A",
    category: "road",
    selectable: true,
  },
  {
    key: "road-b",
    url: "/ride-images/road-b.webp",
    label: "Road B",
    category: "road",
    selectable: true,
  },
  {
    key: "mtb-a",
    url: "/ride-images/mtb-a.webp",
    label: "MTB A",
    category: "mtb",
    selectable: true,
  },
];

vi.mock("../lib/ride-images-dynamic", async () => {
  const actual = await vi.importActual<typeof import("../lib/ride-images-dynamic")>(
    "../lib/ride-images-dynamic",
  );
  return { ...actual, useRideImages: () => catalog };
});

// The gallery and the file picker are existing, separately tested components: stand-ins that
// report a pick are enough to drive the studio's side of the conversation.
vi.mock("../app/TrackGallerySheet", () => ({
  TrackGallerySheet: ({ onPick }: { onPick: (e: unknown) => void }) => (
    <button type="button" onClick={() => onPick({ id: "src-1", name: "Hills loop" })}>
      pick-gallery-track
    </button>
  ),
}));
vi.mock("../app/TrackUploadButton", () => ({
  TrackUploadButton: ({
    onUploadRoute,
    children,
  }: {
    onUploadRoute: (u: unknown) => void;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      onClick={() =>
        onUploadRoute({
          fileName: "mine.gpx",
          restStops: [],
          route: {
            points: [
              [32.1, 34.8],
              [32.2, 34.9],
            ],
            distanceKm: 12.3,
            elevationM: 140,
          },
        })
      }
    >
      {children}
    </button>
  ),
}));

import { EntryChoicePage } from "./EntryChoicePage";
import { createDraft } from "./engine/draft";
import { draftStorageKey, saveDraft } from "./engine/draft-storage";
import { applyAnswers, markAnswered } from "./engine/flow";
import { LOCALE_PREF_KEY } from "./engine/locale-pref";
import { RIDE_STUDIO_OVERRIDE_KEY } from "./flag";
import { NewRideLink } from "./NewRideLink";
import { RideStudioPage } from "./RideStudioPage";
import { resetRuntimeConfigForTests } from "./runtime-config";
import { upsertSpy } from "./testSupport";

vi.mock("../store/eventsStore", async () => {
  const actual =
    await vi.importActual<typeof import("../store/eventsStore")>("../store/eventsStore");
  const realGetState = actual.useEventsStore.getState;
  return {
    ...actual,
    useEventsStore: Object.assign(actual.useEventsStore, {
      getState: () => ({ ...realGetState(), upsertRide: upsertSpy }),
    }),
  };
});

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname + loc.search}</div>;
}

function renderStudio(path = "/events/studio") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/events/studio" element={<RideStudioPage />} />
        <Route path="/events/start" element={<EntryChoicePage />} />
        <Route path="/events/new" element={<div>original-form</div>} />
        <Route path="/" element={<div>home</div>} />
        <Route path="/events/:id" element={<div>ride-page</div>} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );
}

/** Two taps: a day shortcut, then a departure time. */
function pickDate() {
  fireEvent.click(screen.getByRole("button", { name: /^Next Saturday/ }));
  fireEvent.click(screen.getByRole("button", { name: "07:00" }));
}

const cont = () => fireEvent.click(screen.getByRole("button", { name: "Continue" }));

/** Walks the conversation to the review screen with a valid public ride. */
async function walkToReview() {
  fireEvent.click(screen.getByRole("button", { name: /^Road Cycling/ }));
  fireEvent.change(await screen.findByRole("textbox", { name: "What will you call it?" }), {
    target: { value: "Saturday loop" },
  });
  cont();
  await screen.findByText("Where is it happening?"); // the profile country is pre-selected
  cont();
  fireEvent.click(await screen.findByRole("button", { name: /Upload a GPX file/ }));
  cont();
  await screen.findByText("When does the ride start?");
  pickDate();
  cont();
  fireEvent.click(await screen.findByRole("button", { name: /^Public/ }));
  await screen.findByText("A few last details");
  fireEvent.click(screen.getByRole("button", { name: "Skip" }));
  await screen.findByText("Ready to create your ride?");
}

beforeEach(() => {
  localStorage.clear();
  resetRuntimeConfigForTests({ settled: true });
  localStorage.setItem(RIDE_STUDIO_OVERRIDE_KEY, "on");
  profile = { id: 7, canOrganize: true, country: "US" };
  apiMutate.mockReset();
  apiRequest.mockReset();
  upsertSpy.mockReset();
  apiRequest.mockResolvedValue({
    points: [
      [32.1, 34.8],
      [32.2, 34.9],
    ],
    distanceKm: 40,
    elevationM: 520,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// ── UX improvements: entry copy, ride-type cards, day/time shortcuts, progress, sharing ────────

/** Stops the clock on a known local moment without touching timers. */
function setToday(y: number, m: number, d: number) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(y, m - 1, d, 10, 0));
}

async function toStartQuestion() {
  fireEvent.click(screen.getByRole("button", { name: /^Road Cycling/ }));
  fireEvent.change(await screen.findByRole("textbox", { name: "What will you call it?" }), {
    target: { value: "Saturday loop" },
  });
  cont();
  await screen.findByText("Where is it happening?");
  cont();
  fireEvent.click(await screen.findByRole("button", { name: /Upload a GPX file/ }));
  cont();
  await screen.findByText("When does the ride start?");
}

const EN_ENTRY = "How would you like to create your next ride?";

describe("entry screen wording", () => {
  it("speaks about the ride, not the tool, in English", () => {
    renderStudio("/events/start");
    expect(screen.getByRole("heading", { name: EN_ENTRY })).toBeTruthy();
    expect(screen.getByText("Two easy ways to bring your ride to life.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Quick Create/ })).toBeTruthy();
    expect(
      screen.getByText("All your ride details on one screen. Fill them in and you're ready to go."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /Guided Create/ })).toBeTruthy();
    expect(
      screen.getByText("Build your ride step by step, with a live preview along the way."),
    ).toBeTruthy();
    expect(screen.queryByText(/Create normally/)).toBeNull();
    expect(screen.queryByText(/Create with Ride Studio/)).toBeNull();
  });

  it("is in Hebrew, right-to-left, for an Israeli rider", () => {
    profile = { id: 7, canOrganize: true, country: "IL" };
    const { container } = renderStudio("/events/start");
    expect(screen.getByRole("heading", { name: "איך ניצור את הרכיבה הבאה שלך?" })).toBeTruthy();
    expect(screen.getByText("שתי דרכים נוחות להפוך רעיון לרכיבה")).toBeTruthy();
    expect(screen.getByRole("button", { name: /יצירה מהירה/ })).toBeTruthy();
    expect(screen.getByText("כל פרטי הרכיבה במסך אחד. ממלאים ויוצאים לדרך.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /יצירה בליווי אישי/ })).toBeTruthy();
    expect(
      screen.getByText("בונים את הרכיבה צעד אחר צעד, עם תצוגה מקדימה לאורך הדרך."),
    ).toBeTruthy();
    expect(container.querySelector("[dir='rtl']")).toBeTruthy();
  });

  it("an explicit language choice beats the country default, on the entry screen and in the studio", () => {
    profile = { id: 7, canOrganize: true, country: "IL" };
    localStorage.setItem(LOCALE_PREF_KEY, "en");
    const first = renderStudio("/events/start");
    expect(screen.getByRole("heading", { name: EN_ENTRY })).toBeTruthy();
    first.unmount();
    renderStudio("/events/studio");
    expect(screen.getByText("What kind of ride is it?")).toBeTruthy();
  });

  it("picking a language on the entry screen is remembered for the studio", () => {
    profile = { id: 7, canOrganize: true, country: "IL" };
    renderStudio("/events/start");
    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(screen.getByRole("heading", { name: EN_ENTRY })).toBeTruthy();
    expect(localStorage.getItem(LOCALE_PREF_KEY)).toBe("en");
  });

  it("keeps the remembered choice working with the new names", () => {
    const first = renderStudio("/events/start");
    fireEvent.click(screen.getByLabelText("Remember my choice"));
    fireEvent.click(screen.getByRole("button", { name: /Quick Create/ }));
    expect(screen.getByText("original-form")).toBeTruthy();
    first.unmount();
    renderStudio("/events/start");
    expect(screen.getByText("original-form")).toBeTruthy();
  });
});

describe("ride-type cards", () => {
  it("show a picture, a title and a motivating line for each type, in order", () => {
    renderStudio();
    const cards = screen.getAllByRole("button", { name: /Cycling|Biking/ });
    expect(cards.map((c) => c.getAttribute("data-ride-type"))).toEqual(["road", "gravel", "mtb"]);
    for (const card of cards) {
      const img = card.querySelector("img");
      expect(img?.getAttribute("src")).toMatch(
        /^\/images\/ride-studio\/types\/(road|gravel|mtb)\.webp$/,
      );
      expect(img?.getAttribute("alt")).toBe("");
    }
    expect(
      screen.getByText("The peloton is waiting for you. Pace, speed and group energy."),
    ).toBeTruthy();
    expect(
      screen.getByText("The trails are open. Discover new roads and adventures."),
    ).toBeTruthy();
    expect(
      screen.getByText("Adrenaline on the trails. Climbs, descents and challenges."),
    ).toBeTruthy();
  });

  it("are in Hebrew, with the Hebrew titles and lines", () => {
    profile = { id: 7, canOrganize: true, country: "IL" };
    renderStudio();
    expect(screen.getByRole("button", { name: "רכיבת כביש" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "רכיבת גראבל" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "רכיבת שטח" })).toBeTruthy();
    expect(screen.getByText("הפלוטון מחכה לך. קצב, מהירות ואנרגיה קבוצתית.")).toBeTruthy();
    expect(screen.getByText("השבילים פתוחים. מגלים דרכים חדשות והרפתקאות.")).toBeTruthy();
    expect(screen.getByText("אדרנלין בשבילים. עליות, ירידות ואתגרים.")).toBeTruthy();
  });

  it("selecting one stores the ride type's own value and marks the card", async () => {
    renderStudio();
    fireEvent.click(screen.getByRole("button", { name: /^Mountain Biking/ }));
    await screen.findByText("What will you call it?");
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(JSON.parse(localStorage.getItem(draftStorageKey(7)) ?? "{}").activityType).toBe("mtb");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    const card = await screen.findByRole("button", { name: /^Mountain Biking/ });
    expect(card.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /^Road Cycling/ }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("a restored draft shows its type selected", () => {
    const d = applyAnswers(createDraft({ locale: "en", country: "US" }), [
      { questionId: "ride.type", field: "activityType", value: "gravel", source: "ui" },
    ]).draft;
    saveDraft(7, { ...d, currentQuestionId: "ride.type" });
    renderStudio();
    expect(
      screen.getByRole("button", { name: /^Gravel Cycling/ }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("falls back to the card's own colours when a picture cannot load", () => {
    renderStudio();
    const card = screen.getByRole("button", { name: /^Road Cycling/ });
    const img = card.querySelector("img") as HTMLImageElement;
    fireEvent.error(img);
    expect(card.querySelector("img")).toBeNull();
    expect(card.querySelector("[style]")).toBeTruthy(); // the gradient stays behind it
  });

  it("the live preview names the chosen type", async () => {
    renderStudio();
    fireEvent.click(screen.getByRole("button", { name: /^Gravel Cycling/ }));
    await screen.findByText("What will you call it?");
    expect(within(screen.getByLabelText("Your ride")).getByText("Gravel")).toBeTruthy();
  });
});

describe("day and time shortcuts", () => {
  it("two taps set the date and time, and the preview follows", async () => {
    setToday(2026, 10, 12); // a Monday
    renderStudio();
    await toStartQuestion();
    const preview = screen.getByLabelText("Your ride");

    fireEvent.click(screen.getByRole("button", { name: /^Next Friday/ }));
    expect(screen.getByRole("button", { name: /^Next Friday/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(within(preview).getByText(/16 Oct 2026/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "07:30" }));
    expect(screen.getByRole("button", { name: "07:30" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(preview).getByText(/16 Oct 2026.*07:30/)).toBeTruthy();
    expect(screen.getByText(/^Starts /)).toBeTruthy();
    cont(); // valid: moves on to who can see it
    expect(await screen.findByText("Who can see this ride?")).toBeTruthy();
  });

  it("switching to another shortcut moves the highlight and keeps the time", async () => {
    setToday(2026, 10, 12);
    renderStudio();
    await toStartQuestion();
    fireEvent.click(screen.getByRole("button", { name: /^Next Saturday/ }));
    fireEvent.click(screen.getByRole("button", { name: "06:00" }));
    fireEvent.click(screen.getByRole("button", { name: /^Next Sunday/ }));
    expect(
      screen.getByRole("button", { name: /^Next Saturday/ }).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(screen.getByRole("button", { name: /^Next Sunday/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(within(screen.getByLabelText("Your ride")).getByText(/18 Oct 2026.*06:00/)).toBeTruthy();
  });

  it("'next Friday' asked in late December is in January of the next year", async () => {
    setToday(2026, 12, 30);
    renderStudio();
    await toStartQuestion();
    fireEvent.click(screen.getByRole("button", { name: /^Next Friday/ }));
    fireEvent.click(screen.getByRole("button", { name: "08:00" }));
    expect(within(screen.getByLabelText("Your ride")).getByText(/1 Jan 2027.*08:00/)).toBeTruthy();
  });

  it("Continue asks for the time when only the day was chosen", async () => {
    setToday(2026, 10, 12);
    renderStudio();
    await toStartQuestion();
    fireEvent.click(screen.getByRole("button", { name: /^Next Sunday/ }));
    cont();
    expect((await screen.findByRole("alert")).textContent).toBe("Choose a departure time.");
  });

  it("Other Date opens the pickers with the current year selected", async () => {
    setToday(2026, 10, 12);
    renderStudio();
    await toStartQuestion();
    expect(screen.queryByLabelText("Month")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Other Date" }));
    expect((screen.getByLabelText("Year") as HTMLSelectElement).value).toBe("2026");
    fireEvent.change(screen.getByLabelText("Month"), { target: { value: "11" } });
    fireEvent.change(screen.getByLabelText("Day"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "07:00" }));
    expect(within(screen.getByLabelText("Your ride")).getByText(/7 Nov 2026.*07:00/)).toBeTruthy();
  });

  it("a day that has already passed is flagged, and the year is not changed for the rider", async () => {
    setToday(2026, 10, 12);
    renderStudio();
    await toStartQuestion();
    fireEvent.click(screen.getByRole("button", { name: "Other Date" }));
    fireEvent.change(screen.getByLabelText("Month"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Day"), { target: { value: "1" } });
    expect((await screen.findByRole("alert")).textContent).toContain("already passed");
    expect((screen.getByLabelText("Year") as HTMLSelectElement).value).toBe("2026"); // not moved to 2027
    fireEvent.click(screen.getByRole("button", { name: "07:00" }));
    cont();
    expect(screen.getAllByRole("alert").some((a) => a.textContent?.includes("passed"))).toBe(true);
    expect(screen.getByText("When does the ride start?")).toBeTruthy(); // it did not move on
  });

  it("a year the rider picks is kept, and clears the warning", async () => {
    setToday(2026, 10, 12);
    renderStudio();
    await toStartQuestion();
    fireEvent.click(screen.getByRole("button", { name: "Other Date" }));
    fireEvent.change(screen.getByLabelText("Month"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Day"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Year"), { target: { value: "2027" } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "07:00" }));
    expect(within(screen.getByLabelText("Your ride")).getByText(/1 Mar 2027.*07:00/)).toBeTruthy();
  });

  it("Other Time keeps the custom time input available", async () => {
    setToday(2026, 10, 12);
    renderStudio();
    await toStartQuestion();
    fireEvent.click(screen.getByRole("button", { name: /^Next Saturday/ }));
    fireEvent.click(screen.getByRole("button", { name: "Other Time" }));
    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "05:45" } });
    expect(within(screen.getByLabelText("Your ride")).getByText(/17 Oct 2026.*05:45/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Other Time" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("a saved valid start is not rewritten when the question is reopened", () => {
    setToday(2026, 10, 12);
    const d = applyAnswers(createDraft({ locale: "en", country: "US" }), [
      { questionId: "ride.start", field: "startsAt", value: "2027-06-12T07:30", source: "ui" },
    ]).draft;
    saveDraft(7, { ...d, currentQuestionId: "ride.start" });
    renderStudio();
    expect((screen.getByLabelText("Year") as HTMLSelectElement).value).toBe("2027");
    expect((screen.getByLabelText("Month") as HTMLSelectElement).value).toBe("6");
    expect((screen.getByLabelText("Day") as HTMLSelectElement).value).toBe("12");
    expect(screen.getByRole("button", { name: "07:30" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(screen.getByLabelText("Your ride")).getByText(/12 Jun 2027.*07:30/)).toBeTruthy();
  });

  it("is in Hebrew with the Hebrew shortcut names", () => {
    setToday(2026, 10, 12);
    profile = { id: 7, canOrganize: true, country: "IL" };
    const d = applyAnswers(createDraft({ locale: "he", country: "IL" }), [
      { questionId: "ride.type", field: "activityType", value: "road", source: "ui" },
    ]).draft;
    saveDraft(7, { ...d, currentQuestionId: "ride.start" });
    renderStudio();
    for (const label of [/^שישי הבא/, /^שבת הבאה/, /^ראשון הבא/, /^תאריך אחר/, /^שעה אחרת/]) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
    expect(screen.getByRole("heading", { name: "מתי הרכיבה יוצאת לדרך?" })).toBeTruthy();
  });
});

describe("progress battery", () => {
  const segments = () => Array.from(document.querySelectorAll("[data-segment]"));
  const bar = () => screen.getByRole("progressbar");

  it("has one segment per question and fills only for real answers", async () => {
    renderStudio();
    expect(segments()).toHaveLength(7);
    expect(bar().getAttribute("aria-valuemax")).toBe("7");
    expect(bar().getAttribute("aria-valuenow")).toBe("0");
    expect(screen.getByText("Let's build your ride")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Road Cycling/ }));
    await screen.findByText("What will you call it?");
    expect(bar().getAttribute("aria-valuenow")).toBe("1");
    expect(bar().getAttribute("aria-valuetext")).toBe("1 of 7 steps done");

    const name = screen.getByRole("textbox", { name: "What will you call it?" });
    fireEvent.change(name, { target: { value: "Loop" } });
    expect(bar().getAttribute("aria-valuenow")).toBe("2");
    // Clearing the answer makes it invalid again: the segment empties.
    fireEvent.change(name, { target: { value: "  " } });
    expect(bar().getAttribute("aria-valuenow")).toBe("1");
  });

  it("only a genuinely new completion animates", async () => {
    renderStudio();
    fireEvent.click(screen.getByRole("button", { name: /^Road Cycling/ }));
    await screen.findByText("What will you call it?");
    const typeSeg = document.querySelector("[data-segment='ride.type']");
    expect(typeSeg?.hasAttribute("data-fresh")).toBe(true);
    expect(typeSeg?.getAttribute("data-done")).toBe("true");
    expect(document.querySelectorAll("[data-fresh]")).toHaveLength(1);
  });

  it("a restored draft shows its progress at once, without celebrating it", () => {
    let d = createDraft({ locale: "en", country: "US" });
    d = applyAnswers(d, [
      { questionId: "ride.type", field: "activityType", value: "road", source: "ui" },
      { questionId: "ride.name", field: "name", value: "Loop", source: "ui" },
    ]).draft;
    d = markAnswered(d, "ride.where");
    saveDraft(7, { ...d, currentQuestionId: "route.choice" });
    renderStudio();
    expect(bar().getAttribute("aria-valuenow")).toBe("3"); // type, name and where
    expect(document.querySelectorAll("[data-fresh]")).toHaveLength(0);
  });

  it("keeps its progress when going back, and stays one battery next to the three phases", async () => {
    renderStudio();
    fireEvent.click(screen.getByRole("button", { name: /^Road Cycling/ }));
    fireEvent.change(await screen.findByRole("textbox", { name: "What will you call it?" }), {
      target: { value: "Loop" },
    });
    cont();
    await screen.findByText("Where is it happening?");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByText("What will you call it?");
    expect(bar().getAttribute("aria-valuenow")).toBe("2");
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
    for (const phase of ["The idea", "Route & details", "Review & share"]) {
      expect(screen.getByRole("button", { name: phase })).toBeTruthy();
    }
  });

  it("is complete, with the success message, when every question is done", async () => {
    renderStudio();
    await walkToReview();
    expect(bar().getAttribute("aria-valuenow")).toBe("7");
    expect(screen.getByText(/Everything is ready/)).toBeTruthy();
    expect(document.querySelector("[data-complete='true']")).toBeTruthy();
  });

  it("speaks Hebrew and lays out right-to-left", () => {
    profile = { id: 7, canOrganize: true, country: "IL" };
    renderStudio();
    expect(screen.getByRole("progressbar", { name: "התקדמות הרכיבה" })).toBeTruthy();
    expect(screen.getByText("בונים את הרכיבה שלך")).toBeTruthy();
    expect(document.querySelector("[data-dir='rtl']")).toBeTruthy();
  });
});

describe("sharing the created ride", () => {
  const created = {
    id: "ride-9",
    name: "Saturday loop",
    code: "ABC123",
    startsAt: "2027-06-12T04:30:00.000Z",
  };
  const realShare = Object.getOwnPropertyDescriptor(navigator, "share");

  async function createRideAndReachSuccess() {
    apiMutate.mockResolvedValue({ result: created, alreadyApplied: false });
    apiRequest.mockResolvedValue(undefined);
    renderStudio();
    await walkToReview();
    fireEvent.click(screen.getByRole("button", { name: "Create ride" }));
    await screen.findByText("Your ride is ready");
  }

  afterEach(() => {
    if (realShare) Object.defineProperty(navigator, "share", realShare);
    else Reflect.deleteProperty(navigator, "share");
  });

  it("offers Share Ride as the prominent action, never opening sharing by itself", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    await createRideAndReachSuccess();
    expect(screen.getByRole("button", { name: "Share Ride" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Copy ride code|Copy link/ })).toBeNull();
    expect(share).not.toHaveBeenCalled();
  });

  it("uses the native share sheet with the real ride link, title and a short message", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    await createRideAndReachSuccess();
    fireEvent.click(screen.getByRole("button", { name: "Share Ride" }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const payload = share.mock.calls[0][0];
    expect(payload.url).toMatch(/\/join\/ABC123$/);
    expect(payload.title).toBe("Saturday loop");
    expect(payload.text).toContain("Join me for a ride: Saturday loop");
    expect(apiMutate).toHaveBeenCalledTimes(1); // sharing never makes a second ride
  });

  it("closing the share sheet is not an error", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("closed", "AbortError"));
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    await createRideAndReachSuccess();
    fireEvent.click(screen.getByRole("button", { name: "Share Ride" }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(screen.queryByText(/could not share/i)).toBeNull();
  });

  it("falls back to copying the link when the browser cannot share", async () => {
    Reflect.deleteProperty(navigator, "share");
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await createRideAndReachSuccess();
    // The link and a clear Copy link button are already on screen.
    expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Share Ride" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toMatch(/\/join\/ABC123$/);
    expect(await screen.findByText("Link copied")).toBeTruthy();
    expect(apiMutate).toHaveBeenCalledTimes(1);
  });

  it("offers the copy fallback when sharing fails", async () => {
    const share = vi.fn().mockRejectedValue(new Error("nope"));
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    await createRideAndReachSuccess();
    fireEvent.click(screen.getByRole("button", { name: "Share Ride" }));
    expect(await screen.findByText(/could not share/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy();
  });

  it("the success screen shows a full battery", async () => {
    await createRideAndReachSuccess();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("7");
  });
});

describe("on by default, with an emergency switch", () => {
  const clickLink = (name: string) => screen.getByRole("link", { name });

  function renderLink() {
    return render(
      <MemoryRouter>
        <NewRideLink>New Ride</NewRideLink>
      </MemoryRouter>,
    );
  }

  it("an organizer sees both ways to create with nothing activated", () => {
    localStorage.removeItem(RIDE_STUDIO_OVERRIDE_KEY); // no localStorage activation at all
    renderLink();
    expect(clickLink("New Ride").getAttribute("href")).toBe("/events/start");
    cleanup();
    renderStudio("/events/start");
    expect(screen.getByRole("button", { name: /Quick Create/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Guided Create/ })).toBeTruthy();
  });

  it("Quick Create still leads to the unchanged original form", () => {
    localStorage.removeItem(RIDE_STUDIO_OVERRIDE_KEY);
    renderStudio("/events/start");
    fireEvent.click(screen.getByRole("button", { name: /Quick Create/ }));
    expect(screen.getByText("original-form")).toBeTruthy();
  });

  it("a user who cannot organize gets no studio and the original link", () => {
    localStorage.removeItem(RIDE_STUDIO_OVERRIDE_KEY);
    profile = { id: 7, canOrganize: false, country: "US" };
    renderLink();
    expect(clickLink("New Ride").getAttribute("href")).toBe("/events/new");
    cleanup();
    renderStudio("/events/start");
    expect(screen.getByText("original-form")).toBeTruthy();
  });

  it("the emergency switch sends everyone back to the original form, no redeploy", () => {
    localStorage.removeItem(RIDE_STUDIO_OVERRIDE_KEY);
    resetRuntimeConfigForTests({ enabled: false, settled: true });
    renderLink();
    expect(clickLink("New Ride").getAttribute("href")).toBe("/events/new");
    cleanup();
    renderStudio("/events/start");
    expect(screen.getByText("original-form")).toBeTruthy();
    cleanup();
    renderStudio("/events/studio");
    expect(screen.getByText("original-form")).toBeTruthy();
  });

  it("turning the switch off while the page is open takes effect without a reload", async () => {
    localStorage.removeItem(RIDE_STUDIO_OVERRIDE_KEY);
    renderLink();
    expect(clickLink("New Ride").getAttribute("href")).toBe("/events/start");
    act(() => {
      resetRuntimeConfigForTests({ enabled: false, settled: true });
    });
    expect(clickLink("New Ride").getAttribute("href")).toBe("/events/new");
  });

  it("a browser's own opt-out still wins", () => {
    localStorage.setItem(RIDE_STUDIO_OVERRIDE_KEY, "off");
    renderLink();
    expect(clickLink("New Ride").getAttribute("href")).toBe("/events/new");
  });
});
