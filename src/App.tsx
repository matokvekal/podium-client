// Routing and the two gates every screen passes through: are you signed in, and do we know
// your name yet.
//
// Screens are documented at the top of their own file — what the page is for, its route,
// what it loads, what it can do. That is what makes "fix the live map page" actionable.

import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./app/AppShell";
import { useAuth } from "./auth/AuthContext";
import { AccountPage } from "./pages/AccountPage";
import { EventCreatePage } from "./pages/EventCreatePage";
import { EventDetailPage } from "./pages/EventDetailPage";
import { EventGroupsPage } from "./pages/EventGroupsPage";
import { EventParticipantsPage } from "./pages/EventParticipantsPage";
import { EventsListPage } from "./pages/EventsListPage";
import { JoinPage } from "./pages/JoinPage";
import { LiveEventPage } from "./pages/LiveEventPage";
import { LoginPage } from "./pages/LoginPage";
import { ProfileSetupPage } from "./pages/ProfileSetupPage";
import { TeamDetailPage } from "./pages/TeamDetailPage";
import { TeamsPage } from "./pages/TeamsPage";
import { TracksPage } from "./pages/TracksPage";

function RequireAuth({ children }: { children: ReactNode }) {
  const { status, requiresProfile } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return <p className="muted">Loading…</p>;
  }

  if (status === "signed-out") {
    // Remember where they were headed, so a token that expired mid-ride does not also lose
    // their place.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (requiresProfile && location.pathname !== "/account/setup") {
    return <Navigate to="/account/setup" replace />;
  }

  return <AppShell>{children}</AppShell>;
}

/**
 * The events list is the one screen that works for a stranger with no account and no server
 * — like opening a native app before you've signed into anything. It reads the public event
 * list (or a local cache of it) rather than "my events", and only prompts sign-in for actions
 * that actually need an identity: creating, joining, or anything else behind RequireAuth.
 */
function OpenHome({ children }: { children: ReactNode }) {
  const { status, requiresProfile } = useAuth();

  if (status === "signed-in" && requiresProfile) {
    return <Navigate to="/account/setup" replace />;
  }

  return <AppShell>{children}</AppShell>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/account/setup"
        element={
          <RequireAuth>
            <ProfileSetupPage />
          </RequireAuth>
        }
      />

      <Route
        path="/"
        element={
          <OpenHome>
            <EventsListPage />
          </OpenHome>
        }
      />
      <Route
        path="/events/new"
        element={
          <RequireAuth>
            <EventCreatePage />
          </RequireAuth>
        }
      />
      {/* Same component as /events/new — EventCreatePage.tsx detects an :eventId param and
          switches to edit mode ("edit event take us to like the create so i change
          anything"), loading and PATCHing that event instead of POSTing a new one. */}
      <Route
        path="/events/:eventId/edit"
        element={
          <RequireAuth>
            <EventCreatePage />
          </RequireAuth>
        }
      />
      {/* Viewing is open — a public event's detail is readable by anyone, guest or not
          (server: GET /events/:eventId now takes optionalAuth). Actions that mutate
          (edit, status, join) check auth status inside EventDetailPage itself and route to
          /login when attempted signed out, the same pattern the home page's "+ Add" uses.
          Its route map and rider results render inline on this same page — no separate
          click-through — using mock data (lib/mock-results.ts) until the server actually has
          GET /events/:eventId/results; see plan/server-tasks.md. */}
      <Route
        path="/events/:eventId"
        element={
          <OpenHome>
            <EventDetailPage />
          </OpenHome>
        }
      />
      {/* Participants — owner-only start list/check-in/approvals. Once an event is live this
          doubles as the restricted "Manage" view (pause/resume, stop) — same page, not a
          separate screen; see EventParticipantsPage.tsx's own doc comment. */}
      <Route
        path="/events/:eventId/participants"
        element={
          <RequireAuth>
            <EventParticipantsPage />
          </RequireAuth>
        }
      />
      {/* The live map — fully separate from the event detail page on purpose (asked for
          directly: "event page and live are 2 different pages... not same page with 2 maps").
          Open, same as the detail page: a public event's live locations (if show_live_locations
          allows it) are viewable by a guest, not just a signed-in participant. */}
      <Route
        path="/events/live/:eventId"
        element={
          <OpenHome>
            <LiveEventPage />
          </OpenHome>
        }
      />
      {/* Ride groups (Elite/Masters etc.) — owner-only, same reasoning as Participants above.
          Entirely client-only; no server concept of this exists yet at all — see
          store/eventGroupsStore.ts and plan/server-tasks.md Part D. */}
      <Route
        path="/events/:eventId/groups"
        element={
          <RequireAuth>
            <EventGroupsPage />
          </RequireAuth>
        }
      />
      {/* Teams (clubs) — a shared schedule of rides + membership, owner-only for management.
          Entirely client-only, genuinely new territory — see store/teamsStore.ts and
          plan/server-tasks.md. */}
      <Route
        path="/teams"
        element={
          <RequireAuth>
            <TeamsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/teams/:teamId"
        element={
          <RequireAuth>
            <TeamDetailPage />
          </RequireAuth>
        }
      />
      {/* Find Tracks — the route planner. Public, same as everything else browse-shaped.
          Mock data (lib/mock-tracks.ts) until the server has real routes/hazards/POI/air
          quality — see plan/server-tasks.md. */}
      <Route
        path="/routes"
        element={
          <OpenHome>
            <TracksPage />
          </OpenHome>
        }
      />
      <Route
        path="/account"
        element={
          <RequireAuth>
            <AccountPage />
          </RequireAuth>
        }
      />

      {/* Join by link, code or QR. Signed-in only: joining creates a participant row. */}
      <Route
        path="/join"
        element={
          <RequireAuth>
            <JoinPage />
          </RequireAuth>
        }
      />
      <Route
        path="/join/:code"
        element={
          <RequireAuth>
            <JoinPage />
          </RequireAuth>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
