/**
 * @vitest-environment jsdom
 */

// Per-event "Enable Chat" (server sql/056), client side. With chat OFF for a ride:
//   - opening /events/:id/chat directly shows "turned off" and requests NO chat messages, and
//     never polls
//   - the ride is left out of the unread request, so no badge and no background checking
//   - the chat button is not offered (canOpenRideChat)
// With chat ON (or a ride that says nothing — every existing ride) behaviour is unchanged.

import { cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
const { useRideChatUnread } = await import("../app/RideChatButton");
const { useRideChatStore } = await import("../store/rideChatStore");
const { canOpenRideChat, chatRideIds, isRideChatEnabled } = await import("../lib/ride-chat");

const RIDE = "11111111-2222-3333-4444-555555555555";

function renderChat() {
  return render(
    <MemoryRouter initialEntries={[`/events/${RIDE}/chat`]}>
      <Routes>
        <Route path="/events/:eventId/chat" element={<RideChatPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const chatCalls = () =>
  apiRequest.mock.calls.filter(([path]) => String(path).startsWith(`/events/${RIDE}/chat`));

beforeEach(() => {
  apiRequest.mockReset();
  localStorage.clear();
  useRideChatStore.setState({ lastRead: {}, summaries: {} });
});
afterEach(cleanup);

describe("direct navigation to the chat of a ride with chat OFF", () => {
  it("shows 'turned off' when the ride says chatEnabled=false, and sends no message/poll request", async () => {
    apiRequest.mockImplementation(async (path: string) => {
      if (path === `/events/${RIDE}`) return { name: "Ride", chatEnabled: false };
      // The chat GET may race the ride GET; the server refuses it.
      throw new ApiError(403, "Chat is turned off for this ride (RIDE_CHAT_DISABLED)", null);
    });
    renderChat();
    expect(await screen.findByText(/Chat is turned off for this ride/)).toBeTruthy();
    // No composer, no message list.
    expect(screen.queryByRole("textbox")).toBeNull();
    // Nothing polls afterwards: every chat request was the single initial (refused) load.
    expect(chatCalls().every(([, options]) => options?.method !== "POST")).toBe(true);
    expect(chatCalls().length).toBeLessThanOrEqual(1);
  });

  it("the server's RIDE_CHAT_DISABLED refusal alone is enough to block the page", async () => {
    apiRequest.mockImplementation(async (path: string) => {
      if (path === `/events/${RIDE}`) return { name: "Ride" };
      throw new ApiError(403, "Chat is turned off for this ride (RIDE_CHAT_DISABLED)", null);
    });
    renderChat();
    expect(await screen.findByText(/Chat is turned off for this ride/)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("chat ON: the page still opens the chat as before", async () => {
    apiRequest.mockImplementation(async (path: string) => {
      if (path === `/events/${RIDE}`) return { name: "Ride", chatEnabled: true };
      return { messages: [], limits: { maxMessageLength: 500, maxMessages: 500 } };
    });
    renderChat();
    await waitFor(() => expect(screen.getByRole("textbox")).toBeTruthy());
  });
});

describe("no icon, no badge, no background checking when chat is OFF", () => {
  it("the chat button is not offered for the owner / a rider of a chat-OFF ride", () => {
    expect(canOpenRideChat({ chatEnabled: false, isOwner: true })).toBe(false);
    expect(canOpenRideChat({ chatEnabled: false, capabilities: ["event:chat"] })).toBe(false);
    expect(
      canOpenRideChat({ chatEnabled: false, myParticipant: { registrationStatus: "approved" } }),
    ).toBe(false);
  });

  it("chat ON and existing rides (no field) keep the button rules unchanged", () => {
    expect(canOpenRideChat({ chatEnabled: true, isOwner: true })).toBe(true);
    expect(canOpenRideChat({ isOwner: true })).toBe(true);
    expect(canOpenRideChat({ capabilities: ["event:chat"] })).toBe(true);
    expect(canOpenRideChat({ capabilities: [] })).toBe(false);
    expect(isRideChatEnabled({})).toBe(true);
    expect(isRideChatEnabled({ chatEnabled: null })).toBe(true);
    expect(isRideChatEnabled({ chatEnabled: false })).toBe(false);
  });

  it("a chat-OFF ride is left out of the unread list", () => {
    expect(
      chatRideIds([{ id: "a" }, { id: "b", chatEnabled: false }, { id: "c", chatEnabled: true }]),
    ).toEqual(["a", "c"]);
  });

  it("when every ride has chat OFF, the unread endpoint is never called", () => {
    renderHook(() =>
      useRideChatUnread(chatRideIds([{ id: "a", chatEnabled: false }]), true),
    );
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("chat ON rides are still checked, in one request", () => {
    apiRequest.mockResolvedValue([]);
    renderHook(() =>
      useRideChatUnread(
        chatRideIds([
          { id: "a", chatEnabled: false },
          { id: "b", chatEnabled: true },
        ]),
        true,
      ),
    );
    expect(apiRequest).toHaveBeenCalledTimes(1);
    const path = String(apiRequest.mock.calls[0][0]);
    expect(path).toContain("/events/chat/unread");
    expect(decodeURIComponent(path)).toContain("b:0");
    expect(decodeURIComponent(path)).not.toContain("a:0");
  });
});
