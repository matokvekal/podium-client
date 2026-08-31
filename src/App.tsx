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
import { TermsPage } from "./pages/TermsPage";
import { TracksPage } from "./pages/TracksPage";
import { useUserModeStore } from "./store/userModeStore";

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
    // Carry the destination through the setup detour, the same way the sign-in redirect
    // above does. Without it, a first-time rider opening a /join/:code link signed in,
    // got bounced to setup, and was then dropped on the home screen — the code they were
    // invited with gone, and no participant row ever created. They only ended up on the
    // start list if they thought to open the link a second time.
    return <Navigate to="/account/setup" replace state={{ from: location.pathname }} />;
  }

  return <AppShell>{children}</AppShell>;
}

/**
 * Organizer-only screens (create / edit an event, the track planner). In Rider mode these
 * have no entry point in the UI at all — this guard is only for a stale bookmark or a typed
 * URL, sending it back home instead of onto an organizer screen. The components and routes
 * themselves are untouched; switching to Organizer mode restores access with no reload.
 */
function RequireOrganizer({ children }: { children: ReactNode }) {
  const mode = useUserModeStore((state) => state.mode);
  if (mode === "rider") return <Navigate to="/" replace />;
  return <>{children}</>;
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

/**
 * Same open-access gate as OpenHome, but WITHOUT the AppShell chrome — the live map is a
 * full-screen, map-first screen that owns the whole viewport (no app header/footer to tap by
 * accident mid-ride). Its only way out is its own in-screen Back control. See
 * pages/LiveEventPage.tsx.
 */
function OpenFullBleed({ children }: { children: ReactNode }) {
  const { status, requiresProfile } = useAuth();

  if (status === "signed-in" && requiresProfile) {
    return <Navigate to="/account/setup" replace />;
  }

  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Terms & Conditions — a standalone legal document, no shell, open to everyone. Linked
          from the sign-in screen's "I agree" checkbox (LoginPage.tsx). */}
      <Route path="/terms" element={<TermsPage />} />

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
            <RequireOrganizer>
              <EventCreatePage />
            </RequireOrganizer>
          </RequireAuth>
        }
      />
      {/* Same component as /events/new — EventCreatePage.tsx detects an :eventId param and
          switches to edit mode ("edit event take us to like the create so i change
          anything"), loading and PATCHing that event instead of POSTing a new one.

          NOT gated by RequireOrganizer: editing an event you already own is an OWNER action,
          authorised server-side (PATCH /events/:eventId asserts ownership), not a browse-mode
          concern — same reasoning as EventDetailPage's showOrganizerUi. The Edit button on the
          detail page is shown to the owner in either mode, so this route must open for them.
          RequireOrganizer stays on /events/new and /routes (starting something new). */}
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
          <OpenFullBleed>
            <LiveEventPage />
          </OpenFullBleed>
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
          No data source yet — GET /tracks is unbuilt, so this lists nothing. Real routes/hazards/POI/air
          quality — see plan/server-tasks.md. */}
      <Route
        path="/routes"
        element={
          <RequireOrganizer>
            <OpenHome>
              <TracksPage />
            </OpenHome>
          </RequireOrganizer>
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

      {/* Join by link, code or QR.
          OPEN, not RequireAuth. This is the first thing a stranger ever sees of the app — the
          organizer's shared link and printed QR both point here — and gating it sent them to
          the login screen before they had any idea what they were being invited to. Looking a
          code up is already unauthenticated (GET /events/by-code/:code, frozen), so a guest can
          be shown the ride itself: JoinPage.tsx redirects them to /events/:eventId, which is
          equally open, and the "Sign in to join" CTA there is where an identity first becomes
          necessary. Signing in only guards the ACT of joining — POST /events/join is still
          requireAuth server-side, which is the check that actually matters. */}
      <Route
        path="/join"
        element={
          <OpenHome>
            <JoinPage />
          </OpenHome>
        }
      />
      <Route
        path="/join/:code"
        element={
          <OpenHome>
            <JoinPage />
          </OpenHome>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
