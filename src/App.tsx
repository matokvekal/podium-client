// Routing and the two gates every screen passes through: are you signed in, and do we know
// your name yet.
//
// Screens are documented at the top of their own file — what the page is for, its route,
// what it loads, what it can do. That is what makes "fix the live map page" actionable.

import { lazy, type ReactNode, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./app/AppShell";
import { useAuth } from "./auth/AuthContext";
import { AccountPage } from "./pages/AccountPage";
import { EventCreatePage } from "./pages/EventCreatePage";
import { EventDetailPage } from "./pages/EventDetailPage";
import { EventsListPage } from "./pages/EventsListPage";
import { HistoryPage } from "./pages/HistoryPage";
import { JoinPage } from "./pages/JoinPage";
import { LoginPage } from "./pages/LoginPage";
import { ParticipantsPage } from "./pages/ParticipantsPage";
import { ProfileSetupPage } from "./pages/ProfileSetupPage";
import { RouteBrowserPage } from "./pages/RouteBrowserPage";

// Leaflet is heavy — importing it eagerly took Commissaire's bundle from 65 kB to 559 kB.
// The live map is the only screen that needs it, so it loads when that screen does.
const LiveMapPage = lazy(() =>
  import("./pages/LiveMapPage").then((module) => ({ default: module.LiveMapPage })),
);

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
          <RequireAuth>
            <EventsListPage />
          </RequireAuth>
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
      <Route
        path="/events/:eventId"
        element={
          <RequireAuth>
            <EventDetailPage />
          </RequireAuth>
        }
      />
      <Route
        path="/events/:eventId/participants"
        element={
          <RequireAuth>
            <ParticipantsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/events/:eventId/live"
        element={
          <RequireAuth>
            <Suspense fallback={<p className="muted">Loading the map…</p>}>
              <LiveMapPage />
            </Suspense>
          </RequireAuth>
        }
      />

      <Route
        path="/routes"
        element={
          <RequireAuth>
            <RouteBrowserPage />
          </RequireAuth>
        }
      />
      <Route
        path="/history"
        element={
          <RequireAuth>
            <HistoryPage />
          </RequireAuth>
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
