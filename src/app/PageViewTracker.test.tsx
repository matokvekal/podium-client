/**
 * @vitest-environment jsdom
 */

// One POST per real route change, none on a rerender at the same path, none on /admin2026, and
// a rejected request never surfaces. Modeled on FastResume.test.tsx's shape.

import { fireEvent, render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn();
vi.mock("../lib/api-client", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

vi.mock("../lib/visitor", () => ({
  getVisitorId: () => "11111111-1111-4111-8111-111111111111",
  getOrCreateSessionId: () => "22222222-2222-4222-8222-222222222222",
}));

const { PageViewTracker } = await import("./PageViewTracker");

function Nav({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)}>
      go
    </button>
  );
}

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <PageViewTracker />
      <Routes>
        <Route path="*" element={<Nav to="/next" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  apiRequest.mockResolvedValue(undefined);
});

describe("PageViewTracker", () => {
  it("fires one page view for the initial route", async () => {
    renderAt("/events");
    expect(apiRequest).toHaveBeenCalledOnce();
    expect(apiRequest).toHaveBeenCalledWith("/analytics/page-view", {
      method: "POST",
      body: {
        path: "/events",
        visitorId: "11111111-1111-4111-8111-111111111111",
        sessionId: "22222222-2222-4222-8222-222222222222",
        // jsdom's document.referrer is "" by default, which the component normalizes to null.
        referrer: null,
      },
    });
  });

  it("fires again on a real navigation to a new path", async () => {
    const { getByRole } = renderAt("/events");
    apiRequest.mockClear();
    fireEvent.click(getByRole("button"));
    expect(apiRequest).toHaveBeenCalledOnce();
    expect(apiRequest.mock.calls[0][1].body.path).toBe("/next");
  });

  it("does not fire again on a rerender at the same path", () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={["/events"]}>
        <PageViewTracker />
      </MemoryRouter>,
    );
    apiRequest.mockClear();
    rerender(
      <MemoryRouter initialEntries={["/events"]}>
        <PageViewTracker />
      </MemoryRouter>,
    );
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("never fires for /admin2026", () => {
    renderAt("/admin2026");
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("swallows a rejected request without throwing", async () => {
    apiRequest.mockRejectedValue(new Error("network down"));
    expect(() => renderAt("/events")).not.toThrow();
    await Promise.resolve();
  });
});
