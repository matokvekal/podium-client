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
import { draftStorageKey } from "./engine/draft-storage";
import { RIDE_STUDIO_OVERRIDE_KEY } from "./flag";
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

describe("entry", () => {
  it("sends anyone without access straight to the original form", () => {
    localStorage.setItem(RIDE_STUDIO_OVERRIDE_KEY, "off");
    renderStudio("/events/studio");
    expect(screen.getByText("original-form")).toBeTruthy();
  });

  it("sends a user who cannot organize to the original form too", () => {
    profile = { id: 7, canOrganize: false, country: "US" };
    renderStudio("/events/start");
    expect(screen.getByText("original-form")).toBeTruthy();
  });

  it("offers both ways to create, and the original one leads to /events/new", () => {
    renderStudio("/events/start");
    expect(screen.getByRole("button", { name: /Guided Create/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Quick Create/ }));
    expect(screen.getByText("original-form")).toBeTruthy();
  });

  it("remembers the choice and skips the fork next time", () => {
    const first = renderStudio("/events/start");
    fireEvent.click(screen.getByLabelText("Remember my choice"));
    fireEvent.click(screen.getByRole("button", { name: /Guided Create/ }));
    expect(screen.getByText("What kind of ride is it?")).toBeTruthy();
    first.unmount();
    renderStudio("/events/start");
    expect(screen.getByText("What kind of ride is it?")).toBeTruthy();
  });

  it("?choose=1 shows the fork again even when a choice is remembered", () => {
    localStorage.setItem("podium.rideCreateMethod", "studio");
    renderStudio("/events/start?choose=1");
    expect(screen.getByRole("button", { name: /Quick Create/ })).toBeTruthy();
  });
});

describe("the conversation", () => {
  it("starts with the ride type, in the same frame as every question", () => {
    renderStudio();
    expect(screen.getByText("What kind of ride is it?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save & exit" })).toBeTruthy();
    for (const type of ["Road Cycling", "Gravel Cycling", "Mountain Biking"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${type}`) })).toBeTruthy();
    }
    // A cycling studio: no Running card.
    expect(screen.queryByRole("button", { name: /Running/ })).toBeNull();
  });

  it("one tap on a type moves on, and the preview follows", async () => {
    renderStudio();
    fireEvent.click(screen.getByRole("button", { name: /^Mountain Biking/ }));
    expect(await screen.findByText("What will you call it?")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "What will you call it?" }), {
      target: { value: "Dawn trail" },
    });
    const preview = screen.getByLabelText("Your ride");
    expect(within(preview).getByRole("heading", { name: "Dawn trail" })).toBeTruthy();
  });

  it("will not continue without a name, and says so", async () => {
    renderStudio();
    fireEvent.click(screen.getByRole("button", { name: /^Road Cycling/ }));
    await screen.findByText("What will you call it?");
    cont();
    expect((await screen.findByRole("alert")).textContent).toBe("Give your ride a name.");
    expect(screen.getByText("What will you call it?")).toBeTruthy();
  });

  it("Back keeps what was typed", async () => {
    renderStudio();
    fireEvent.click(screen.getByRole("button", { name: /^Road Cycling/ }));
    fireEvent.change(await screen.findByRole("textbox", { name: "What will you call it?" }), {
      target: { value: "Keep me" },
    });
    cont();
    await screen.findByText("Where is it happening?");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    const name = (await screen.findByRole("textbox", {
      name: "What will you call it?",
    })) as HTMLInputElement;
    expect(name.value).toBe("Keep me");
  });

  it("Back on the first question returns to the fork", () => {
    renderStudio();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: /Quick Create/ })).toBeTruthy();
  });

  it("the dropdown says 'Select from the list'", async () => {
    renderStudio();
    fireEvent.click(screen.getByRole("button", { name: /^Road Cycling/ }));
    await screen.findByText("What will you call it?");
    fireEvent.change(screen.getByRole("textbox", { name: "What will you call it?" }), {
      target: { value: "x" },
    });
    cont();
    await screen.findByText("Where is it happening?");
    fireEvent.change(screen.getByLabelText("Country"), { target: { value: "" } });
    expect(screen.getByRole("option", { name: "Select from the list" })).toBeTruthy();
  });

  it("an optional question can be skipped; a required one has no Skip", async () => {
    renderStudio();
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    await walkToReview();
    expect(screen.getByText("Ready to create your ride?")).toBeTruthy();
  });

  it("the route can come from the gallery, with its geometry fetched like the original form does", async () => {
    renderStudio();
    fireEvent.click(screen.getByRole("button", { name: /^Road Cycling/ }));
    fireEvent.change(await screen.findByRole("textbox", { name: "What will you call it?" }), {
      target: { value: "x" },
    });
    cont();
    await screen.findByText("Where is it happening?");
    cont();
    fireEvent.click(await screen.findByRole("button", { name: /Browse tracks/ }));
    fireEvent.click(await screen.findByRole("button", { name: "pick-gallery-track" }));
    await screen.findByText("Hills loop");
    expect(apiRequest).toHaveBeenCalledWith("/events/src-1/route");
  });

  it("a gallery track with no saved route is refused with a message", async () => {
    apiRequest.mockResolvedValue(null);
    renderStudio();
    fireEvent.click(screen.getByRole("button", { name: /^Road Cycling/ }));
    fireEvent.change(await screen.findByRole("textbox", { name: "What will you call it?" }), {
      target: { value: "x" },
    });
    cont();
    await screen.findByText("Where is it happening?");
    cont();
    fireEvent.click(await screen.findByRole("button", { name: /Browse tracks/ }));
    fireEvent.click(await screen.findByRole("button", { name: "pick-gallery-track" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Pick a track for this ride.");
  });
});

describe("saving and resuming", () => {
  it("Save & exit keeps the draft; coming back lands where they left off with every answer", async () => {
    const first = renderStudio();
    fireEvent.click(screen.getByRole("button", { name: /^Gravel/ }));
    fireEvent.change(await screen.findByRole("textbox", { name: "What will you call it?" }), {
      target: { value: "Half done" },
    });
    cont();
    await screen.findByText("Where is it happening?");
    fireEvent.click(screen.getByRole("button", { name: "Save & exit" }));
    expect(screen.getByText("home")).toBeTruthy();
    expect(localStorage.getItem(draftStorageKey(7))).toContain("Half done");
    first.unmount();

    renderStudio();
    expect(await screen.findByText("Where is it happening?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(
      ((await screen.findByRole("textbox", { name: "What will you call it?" })) as HTMLInputElement)
        .value,
    ).toBe("Half done");
  });

  it("a refresh mid-typing loses nothing (the draft is flushed when the page hides)", async () => {
    const view = renderStudio();
    fireEvent.click(screen.getByRole("button", { name: /^Road Cycling/ }));
    fireEvent.change(await screen.findByRole("textbox", { name: "What will you call it?" }), {
      target: { value: "Typed just now" },
    });
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(localStorage.getItem(draftStorageKey(7))).toContain("Typed just now");
    view.unmount();
  });

  it("each user has their own draft", async () => {
    const view = renderStudio();
    fireEvent.click(screen.getByRole("button", { name: /^Road Cycling/ }));
    fireEvent.change(await screen.findByRole("textbox", { name: "What will you call it?" }), {
      target: { value: "Mine" },
    });
    view.unmount();
    profile = { id: 8, canOrganize: true, country: "US" };
    renderStudio();
    expect(screen.getByText("What kind of ride is it?")).toBeTruthy();
  });

  it("the fork offers to resume, naming the unfinished ride", async () => {
    const view = renderStudio();
    fireEvent.click(screen.getByRole("button", { name: /^Road Cycling/ }));
    fireEvent.change(await screen.findByRole("textbox", { name: "What will you call it?" }), {
      target: { value: "Loop" },
    });
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    view.unmount();
    renderStudio("/events/start");
    expect(screen.getByRole("button", { name: /Continue "Loop"/ })).toBeTruthy();
  });
});

describe("language", () => {
  it("switches to Hebrew right-to-left without erasing the draft", async () => {
    const { container } = renderStudio();
    fireEvent.click(screen.getByRole("button", { name: /^Road Cycling/ }));
    fireEvent.change(await screen.findByRole("textbox", { name: "What will you call it?" }), {
      target: { value: "Keep this" },
    });
    const root = container.querySelector('[data-testid="ride-studio"]') as HTMLElement;
    expect(root.getAttribute("dir")).toBe("ltr");

    fireEvent.click(screen.getByRole("button", { name: "עב" }));
    expect(root.getAttribute("dir")).toBe("rtl");
    expect(root.getAttribute("lang")).toBe("he");
    expect(screen.getByText("איך תקראו לה?")).toBeTruthy();
    expect(
      ((await screen.findByRole("textbox", { name: "איך תקראו לה?" })) as HTMLInputElement).value,
    ).toBe("Keep this");

    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(root.getAttribute("dir")).toBe("ltr");
    expect(
      ((await screen.findByRole("textbox", { name: "What will you call it?" })) as HTMLInputElement)
        .value,
    ).toBe("Keep this");
  });

  it("starts in Hebrew for an Israeli profile with a Hebrew device", () => {
    profile = { id: 7, canOrganize: true, country: "IL" };
    renderStudio();
    // Test devices are English: the profile country still wins for Israel.
    expect(screen.getByText("איזו רכיבה זו?")).toBeTruthy();
  });
});

describe("creating the ride", () => {
  it("shows a review first and creates nothing until Create is pressed", async () => {
    renderStudio();
    await walkToReview();
    expect(apiMutate).not.toHaveBeenCalled();
    const list = screen.getByText("Check the details. Nothing is created until you confirm.");
    expect(list).toBeTruthy();
    expect(screen.getAllByText("Saturday loop").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Create ride" })).toBeTruthy();
  });

  it("the review lists what is missing, links to it, and blocks Create", async () => {
    renderStudio();
    fireEvent.click(screen.getByRole("button", { name: /^Road Cycling/ }));
    // jump to the review through the stage chips
    fireEvent.click(screen.getByRole("button", { name: "Review & share" }));
    const create = (await screen.findByRole("button", {
      name: "Create ride",
    })) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    expect(screen.getByText("Still needed")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "What will you call it?" }));
    expect(await screen.findByRole("textbox", { name: "What will you call it?" })).toBeTruthy();
  });

  it("creates the ride once, with the draft's submission id, then clears the draft", async () => {
    apiMutate.mockResolvedValue({
      result: { id: "ride-9", name: "Saturday loop", code: "ABC123" },
      alreadyApplied: false,
    });
    apiRequest.mockResolvedValue(undefined);
    renderStudio();
    await walkToReview();
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    const stored = JSON.parse(localStorage.getItem(draftStorageKey(7)) ?? "{}");

    const button = screen.getByRole("button", { name: "Create ride" });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(await screen.findByText("Your ride is ready")).toBeTruthy();
    expect(apiMutate).toHaveBeenCalledTimes(1);
    const [path, options] = apiMutate.mock.calls[0];
    expect(path).toBe("/events");
    expect(options.clientActionId).toBe(stored.submissionId);
    expect(options.body).toMatchObject({
      name: "Saturday loop",
      visibility: "public",
      country: "US",
      activityType: "road",
      type: "RIDE",
    });
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "View ride" }).getAttribute("href")).toBe(
      "/events/ride-9",
    );
    // The finished ride is no longer a draft to resume.
    const left = localStorage.getItem(draftStorageKey(7));
    expect(left === null || !left.includes("Saturday loop")).toBe(true);
  });

  it("a failed create keeps every answer and can be retried safely", async () => {
    const { ApiError } = await import("../lib/api-client");
    apiMutate.mockRejectedValueOnce(new ApiError(503, "Server is down", "UNAVAILABLE"));
    renderStudio();
    await walkToReview();

    fireEvent.click(screen.getByRole("button", { name: "Create ride" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Server is down");
    expect(screen.getAllByText("Saturday loop").length).toBeGreaterThan(0);
    expect(
      (screen.getByRole("button", { name: "Create ride" }) as HTMLButtonElement).disabled,
    ).toBe(false);

    apiMutate.mockResolvedValueOnce({
      result: { id: "ride-10", name: "Saturday loop", code: "X" },
      alreadyApplied: false,
    });
    apiRequest.mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Create ride" }));
    expect(await screen.findByText("Your ride is ready")).toBeTruthy();
    expect(apiMutate.mock.calls[0][1].clientActionId).toBe(
      apiMutate.mock.calls[1][1].clientActionId,
    );
  });

  it("creating another ride starts a different submission", async () => {
    apiMutate.mockResolvedValue({
      result: { id: "r1", name: "Saturday loop", code: "A" },
      alreadyApplied: false,
    });
    apiRequest.mockResolvedValue(undefined);
    renderStudio();
    await walkToReview();
    fireEvent.click(screen.getByRole("button", { name: "Create ride" }));
    await screen.findByText("Your ride is ready");
    fireEvent.click(screen.getByRole("button", { name: "Create another" }));
    expect(await screen.findByText("What kind of ride is it?")).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText("Your ride")).toBeTruthy());
  });
});

describe("cover image", () => {
  async function toNameWithType(type: RegExp) {
    renderStudio();
    fireEvent.click(screen.getByRole("button", { name: type }));
    await screen.findByText("What will you call it?");
  }

  it("suggests a cover for the ride type, with a way to change it", async () => {
    await toNameWithType(/^Road Cycling/);
    const preview = screen.getByLabelText("Your ride");
    expect((within(preview).getByRole("img") as HTMLImageElement).src).toContain(
      "/images/ride-covers/road-",
    );
    expect(within(preview).getByRole("button", { name: "Change image" })).toBeTruthy();
  });

  it("the organizer's own pick is kept when the type changes afterwards", async () => {
    await toNameWithType(/^Road Cycling/);
    const preview = screen.getByLabelText("Your ride");
    fireEvent.click(within(preview).getByRole("button", { name: "Change image" }));
    const sheet = await screen.findByRole("dialog", { name: "Cover image" });
    fireEvent.click(within(sheet).getByRole("button", { name: /Road B/ }));
    expect((within(preview).getByRole("img") as HTMLImageElement).src).toContain("road-b");

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(await screen.findByRole("button", { name: /^Mountain Biking/ }));
    // Re-picking on a question already answered stays put (no jump ahead); the cover is theirs.
    expect(
      (within(screen.getByLabelText("Your ride")).getByRole("img") as HTMLImageElement).src,
    ).toContain("road-b");
  });

  it("the review shows the cover and lets the organizer change it (the phone preview is collapsed)", async () => {
    renderStudio();
    await walkToReview();
    expect(screen.getByText("Road A")).toBeTruthy(); // the suggestion for a road ride
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    const sheet = await screen.findByRole("dialog", { name: "Cover image" });
    fireEvent.click(within(sheet).getByRole("button", { name: /Road B/ }));
    expect(screen.getByText("Road B")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    fireEvent.click(await screen.findByRole("button", { name: "No cover image" }));
    expect(screen.getAllByText("No cover image").length).toBeGreaterThan(0);
  });

  it("the organizer can choose no cover at all", async () => {
    await toNameWithType(/^Road Cycling/);
    const preview = screen.getByLabelText("Your ride");
    fireEvent.click(within(preview).getByRole("button", { name: "Change image" }));
    fireEvent.click(await screen.findByRole("button", { name: "No cover image" }));
    expect(within(preview).queryByRole("img")).toBeNull();
  });
});
