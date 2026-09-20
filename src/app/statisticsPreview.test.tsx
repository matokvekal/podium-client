/**
 * @vitest-environment jsdom
 */

// Statistics preview gate: Achievements is for every signed-in rider, everything else in
// Statistics stays preview-only.
//
// Two real surfaces are exercised, not the helper in isolation:
//   * the actual <App/> route table — so a route that loses its guard (or Achievements gaining
//     one) fails here;
//   * the actual <AppDrawer/> — the menu entries.
// Only the pages themselves, the shell chrome and the auth context are stubbed; the guard and the
// routes are the real ones.

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

let canSeeStatistics: boolean | undefined;
let authStatus: "signed-in" | "signed-out" = "signed-in";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    status: authStatus,
    requiresProfile: false,
    signOut: vi.fn(),
    profile: authStatus === "signed-in" ? { id: 1, canSeeStatistics } : null,
  }),
}));

// Pass-through chrome: RequireAuth wraps every route in AppShell, which is not what is under test.
vi.mock("./AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("./FastResume", () => ({ FastResume: () => null }));

// The pages under test, as markers — the real ones need stores and the network.
vi.mock("../pages/StatisticsPage", () => ({
  StatisticsPage: () => <div>PAGE my-statistics</div>,
}));
vi.mock("../pages/StatisticsLeaderboardPage", () => ({
  StatisticsLeaderboardPage: () => <div>PAGE leaderboard</div>,
}));
vi.mock("../pages/StatisticsAchievementsPage", () => ({
  StatisticsAchievementsPage: () => <div>PAGE achievements</div>,
}));
// Where a bounced rider lands ("/"): a marker, so the redirect is observable.
vi.mock("../pages/EventsListPage", () => ({ EventsListPage: () => <div>PAGE home</div> }));

// The drawer's own dependencies.
vi.mock("./useMyIdentity", () => ({
  useMyIdentity: () => ({
    signedIn: true,
    displayName: "Rider",
    avatarUrl: null,
    avatar: null,
    localAvatar: null,
    seed: "s",
  }),
}));

const { App } = await import("../App");
const { AppDrawer } = await import("./AppDrawer");

function openAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authStatus = "signed-in";
  canSeeStatistics = undefined;
});

describe("routes", () => {
  describe("a normal signed-in rider", () => {
    beforeEach(() => {
      canSeeStatistics = false;
    });

    it("can open Achievements", () => {
      openAt("/stats/achievements");
      expect(screen.getByText("PAGE achievements")).toBeTruthy();
    });

    it("is sent home from My Statistics", () => {
      openAt("/stats");
      expect(screen.queryByText("PAGE my-statistics")).toBeNull();
      expect(screen.getByText("PAGE home")).toBeTruthy();
    });

    it("is sent home from the Leaderboard", () => {
      openAt("/stats/leaderboard");
      expect(screen.queryByText("PAGE leaderboard")).toBeNull();
      expect(screen.getByText("PAGE home")).toBeTruthy();
    });

    it("is sent home from the legacy /stats/year URL too", () => {
      openAt("/stats/year");
      expect(screen.queryByText("PAGE my-statistics")).toBeNull();
      expect(screen.getByText("PAGE home")).toBeTruthy();
    });
  });

  describe("a profile that does not say (cached older profile)", () => {
    it("is treated as not on the preview list — only an explicit true opens it", () => {
      canSeeStatistics = undefined;
      openAt("/stats");
      expect(screen.queryByText("PAGE my-statistics")).toBeNull();
    });
  });

  describe("the preview account (canSeeStatistics)", () => {
    beforeEach(() => {
      canSeeStatistics = true;
    });

    it("can open Achievements", () => {
      openAt("/stats/achievements");
      expect(screen.getByText("PAGE achievements")).toBeTruthy();
    });

    it("still opens My Statistics", () => {
      openAt("/stats");
      expect(screen.getByText("PAGE my-statistics")).toBeTruthy();
    });

    it("still opens the Leaderboard", () => {
      openAt("/stats/leaderboard");
      expect(screen.getByText("PAGE leaderboard")).toBeTruthy();
    });

    it("keeps /stats/year working (redirects to My Statistics)", () => {
      openAt("/stats/year");
      expect(screen.getByText("PAGE my-statistics")).toBeTruthy();
    });
  });

  it("a signed-out visitor still goes to login, not to Achievements", () => {
    authStatus = "signed-out";
    openAt("/stats/achievements");
    expect(screen.queryByText("PAGE achievements")).toBeNull();
  });
});

describe("drawer", () => {
  function drawerLinks() {
    render(
      <MemoryRouter>
        <AppDrawer open onClose={() => {}} colorTheme="day" onToggleColorTheme={() => {}} />
      </MemoryRouter>,
    );
    return {
      myStatistics: screen.queryByRole("link", { name: "My Statistics" }),
      achievements: screen.queryByRole("link", { name: "Achievements" }),
      leaderboard: screen.queryByRole("link", { name: "Leaderboard" }),
    };
  }

  it("normal rider: sees Achievements only", () => {
    canSeeStatistics = false;
    const links = drawerLinks();
    expect(links.achievements?.getAttribute("href")).toBe("/stats/achievements");
    expect(links.myStatistics).toBeNull();
    expect(links.leaderboard).toBeNull();
  });

  it("preview account: sees all three, exactly as before", () => {
    canSeeStatistics = true;
    const links = drawerLinks();
    expect(links.myStatistics?.getAttribute("href")).toBe("/stats");
    expect(links.achievements?.getAttribute("href")).toBe("/stats/achievements");
    expect(links.leaderboard?.getAttribute("href")).toBe("/stats/leaderboard");
  });

  it("signed out: no Statistics entries at all", () => {
    authStatus = "signed-out";
    const links = drawerLinks();
    expect(links.achievements).toBeNull();
    expect(links.myStatistics).toBeNull();
    expect(links.leaderboard).toBeNull();
  });
});
