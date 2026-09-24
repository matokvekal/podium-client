/**
 * @vitest-environment jsdom
 */

// The ride chat screen, against a stubbed API:
//   - it loads the ride's messages (and a finished ride's, from History, the same way)
//   - a sent message shows at once, without waiting for a poll
//   - a failed send keeps the typed text
//   - reading the chat moves the last-read id
//   - the chat icon shows its unread badge from the store

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn();

vi.mock("../lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("../lib/api-client")>("../lib/api-client");
  return { ...actual, apiRequest: (...a: unknown[]) => apiRequest(...a) };
});

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ status: "signed-in", profile: { id: 7 } }),
}));

const { ApiError } = await import("../lib/api-client");
const { RideChatPage } = await import("./RideChatPage");
const { RideChatButton } = await import("../app/RideChatButton");
const { useRideChatStore } = await import("../store/rideChatStore");

const RIDE = "11111111-2222-3333-4444-555555555555";
const LIMITS = { maxMessageLength: 500, maxMessages: 500 };

function message(id: number, text: string, userId = 3, extra: object = {}) {
  return {
    id,
    userId,
    userName: userId === 7 ? "Me" : "David",
    isOrganizer: false,
    text,
    createdAt: new Date().toISOString(),
    ...extra,
  };
}

/** Route every call by path so the test reads like the conversation. */
function serve(handlers: { history?: unknown[]; send?: (body: { text: string }) => unknown }) {
  apiRequest.mockImplementation(
    async (path: string, options?: { method?: string; body?: unknown }) => {
      if (path === `/events/${RIDE}`) return { name: "Saturday MTB Ride", status: "finished" };
      if (path === `/events/${RIDE}/chat` && options?.method === "POST") {
        if (!handlers.send) throw new Error("no send handler");
        return handlers.send(options.body as { text: string });
      }
      if (path.startsWith(`/events/${RIDE}/chat`)) {
        return {
          messages: path.includes("afterId") ? [] : (handlers.history ?? []),
          limits: LIMITS,
        };
      }
      throw new Error(`unexpected ${path}`);
    },
  );
}

function renderChat() {
  return render(
    <MemoryRouter initialEntries={[`/events/${RIDE}/chat`]}>
      <Routes>
        <Route path="/events/:eventId/chat" element={<RideChatPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  apiRequest.mockReset();
  localStorage.clear();
  useRideChatStore.setState({ lastRead: {}, summaries: {} });
  // jsdom has no layout; the page scrolls the newest message into view.
  Element.prototype.scrollIntoView = vi.fn();
});

describe("RideChatPage", () => {
  it("loads the ride's messages, names the ride and says the chat is not private", async () => {
    serve({
      history: [
        message(1, "I'm at the parking lot"),
        message(2, "We start at 07:00", 3, { isOrganizer: true }),
      ],
    });
    renderChat();

    expect(await screen.findByText("I'm at the parking lot")).toBeTruthy();
    expect(screen.getByText("We start at 07:00")).toBeTruthy();
    expect(screen.getByText("Organizer")).toBeTruthy();
    expect(await screen.findByText("Saturday MTB Ride")).toBeTruthy();
    expect(screen.getByText(/visible to all riders in this ride/)).toBeTruthy();
  });

  it("opens a finished ride's existing chat from History", async () => {
    serve({ history: [message(40, "Great ride everyone")] });
    renderChat();
    expect(await screen.findByText("Great ride everyone")).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith(`/events/${RIDE}/chat`);
  });

  it("shows a sent message immediately and clears the box", async () => {
    serve({ history: [], send: (body) => message(10, body.text, 7) });
    renderChat();
    const box = await screen.findByLabelText("Message");

    fireEvent.change(box, { target: { value: "  5 minutes away " } });
    fireEvent.click(screen.getByLabelText("Send message"));

    expect(await screen.findByText("5 minutes away")).toBeTruthy();
    expect(screen.getByText("You")).toBeTruthy();
    expect((box as HTMLTextAreaElement).value).toBe("");
    expect(apiRequest).toHaveBeenCalledWith(`/events/${RIDE}/chat`, {
      method: "POST",
      body: { text: "5 minutes away" },
    });
  });

  it("keeps the typed text when a send fails", async () => {
    serve({
      history: [],
      send: () => {
        throw new ApiError(500, "boom");
      },
    });
    renderChat();
    const box = await screen.findByLabelText("Message");

    fireEvent.change(box, { target: { value: "Running late" } });
    fireEvent.click(screen.getByLabelText("Send message"));

    expect(await screen.findByText(/Couldn't send/)).toBeTruthy();
    expect((box as HTMLTextAreaElement).value).toBe("Running late");
  });

  it("explains a full chat instead of losing the message", async () => {
    serve({
      history: [],
      send: () => {
        throw new ApiError(409, "full");
      },
    });
    renderChat();
    const box = await screen.findByLabelText("Message");
    fireEvent.change(box, { target: { value: "one more" } });
    fireEvent.click(screen.getByLabelText("Send message"));

    expect(await screen.findByText(/chat is full/)).toBeTruthy();
    expect((box as HTMLTextAreaElement).value).toBe("one more");
  });

  it("marks the newest message as read", async () => {
    serve({ history: [message(18441, "a"), message(18442, "b")] });
    renderChat();
    await screen.findByText("b");
    await waitFor(() => expect(useRideChatStore.getState().lastRead[RIDE]).toBe(18442));
    expect(useRideChatStore.getState().summaries[RIDE]?.unread).toBe(0);
  });

  it("tells a rider who is not on the ride that the chat is for its riders", async () => {
    apiRequest.mockImplementation(async (path: string) => {
      if (path === `/events/${RIDE}`) return { name: "Ride" };
      throw new ApiError(403, "no");
    });
    renderChat();
    expect(await screen.findByText(/This chat is for the riders on this ride/)).toBeTruthy();
  });
});

describe("RideChatButton", () => {
  function renderButton() {
    return render(
      <MemoryRouter>
        <RideChatButton rideId={RIDE} />
      </MemoryRouter>,
    );
  }

  it("shows no count when nothing is unread", () => {
    useRideChatStore.setState({ summaries: { [RIDE]: { rideId: RIDE, latestId: 5, unread: 0 } } });
    renderButton();
    expect(screen.getByLabelText("Ride chat, no new messages")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("shows the count when there are unread messages", () => {
    useRideChatStore.setState({ summaries: { [RIDE]: { rideId: RIDE, latestId: 9, unread: 3 } } });
    renderButton();
    expect(screen.getByLabelText("Ride chat, 3 unread")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("drops the badge the moment the chat is read", () => {
    useRideChatStore.setState({ summaries: { [RIDE]: { rideId: RIDE, latestId: 9, unread: 3 } } });
    renderButton();
    act(() => useRideChatStore.getState().markRead(RIDE, 9));
    expect(screen.queryByText("3")).toBeNull();
    expect(screen.queryByText("0")).toBeNull();
  });
});
