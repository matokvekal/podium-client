// The frame every screen sits in: header, the slide-out drawer, the offline banner.
//
// Hamburger + drawer, not a persistent nav bar — see AppDrawer.tsx. Every screen this shell
// wraps is reachable without signing in; the drawer's own footer is the one place that asks
// for it, and only as an offered action, never a redirect.
//
// Header layout matches the Figma reference (plan/ui/page1, "Top Bar"): rounded bottom
// corners, centered wordmark, avatar on the right. Two things from that mock are
// deliberately not here: the fake status-bar row (time/signal/wifi/battery) is Figma's
// device-frame chrome for showing "what this looks like on a phone", not something a real
// PWA draws inside its own content; and the notification/message icon, since there is no
// messaging feature in this app for it to open — an icon with nowhere to go is worse than no
// icon.

import { ArrowLeft, Menu, User } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { apiRequest } from "../lib/api-client";
import { applyColorTheme, type ColorTheme, getInitialColorTheme } from "../lib/color-theme";
import { useConnectivityStore } from "../lib/connectivity";
import { useOnlineStatus } from "../lib/useOnlineStatus";
import { AppDrawer } from "./AppDrawer";
import { Avatar } from "./Avatar";
import { useMyIdentity } from "./useMyIdentity";

// The event detail page ("/events/:eventId", but not the "new"/"edit"/sub-route variants)
// swaps the hamburger for a back arrow here, next to the wordmark — asked for directly ("back
// aroe up near the El Nini title"). Teams get the same treatment — asked for directly ("at
// teams i need arow back") — both the team list and one team's own page. Every other screen
// keeps the hamburger.
const EVENT_DETAIL_PATH = /^\/events\/[^/]+$/;
const TEAMS_PATH = /^\/teams(\/[^/]+)?$/;

export function AppShell({ children }: { children: ReactNode }) {
  const online = useOnlineStatus();
  const serverReachable = useConnectivityStore((s) => s.serverReachable);
  const connected = online && serverReachable;

  // Recovery probe. Without it, "the server is back" is only noticed the next time some page
  // happens to poll — up to a few minutes on the event page, and never at all on a list page
  // that loads once. This retries a single cheap public endpoint while (and only while) the
  // server is known to be down; the api client flips serverReachable on any response, which
  // clears the banner and bumps reconnectNonce, which is what makes the open pages refetch.
  // Nothing here inspects the result — reaching the server at all is the whole signal.
  useEffect(() => {
    if (serverReachable) return;
    const probe = () => {
      void apiRequest("/auth/config", { anonymous: true }).catch(() => undefined);
    };
    const timer = window.setInterval(probe, 15000);
    // Also probe immediately when the device itself reports the network is back, rather than
    // waiting out the interval.
    window.addEventListener("online", probe);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", probe);
    };
  }, [serverReachable]);
  const { status } = useAuth();
  const me = useMyIdentity();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [colorTheme, setColorTheme] = useState<ColorTheme>(() => getInitialColorTheme());

  const showBackArrow =
    (EVENT_DETAIL_PATH.test(location.pathname) && location.pathname !== "/events/new") ||
    TEAMS_PATH.test(location.pathname);

  useEffect(() => {
    applyColorTheme(colorTheme);
  }, [colorTheme]);

  function toggleColorTheme() {
    setColorTheme((current) => (current === "day" ? "dark" : "day"));
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        {showBackArrow ? (
          <button
            type="button"
            className="app-header__icon-btn"
            onClick={() => navigate(-1)}
            aria-label="Back"
          >
            <ArrowLeft aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            className="app-header__icon-btn"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
          >
            <Menu aria-hidden="true" />
          </button>
        )}

        <NavLink to="/" className="app-header__brand">
          <img
            className="app-header__logo"
            src="/logo.png"
            alt=""
            aria-hidden="true"
            width={22}
            height={22}
          />
          El Niño Move
        </NavLink>

        <button
          type="button"
          className="app-header__avatar"
          aria-label={status === "signed-in" ? "Account" : "Sign in"}
          onClick={() => (status === "signed-in" ? navigate("/account") : setDrawerOpen(true))}
        >
          {/* A signed-in rider sees their own picture here — their chosen avatar, else their
              Google photo, else the initial placeholder every other avatar in the app uses.
              Signed out there is nobody to show, so the generic icon stays. */}
          {me.signedIn ? (
            <Avatar
              className="identity-avatar"
              name={me.displayName}
              avatarUrl={me.avatarUrl}
              identity={me.avatar}
              localSelection={me.localAvatar}
              seed={me.seed}
            />
          ) : (
            <User aria-hidden="true" />
          )}
        </button>
      </header>

      <AppDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        colorTheme={colorTheme}
        onToggleColorTheme={toggleColorTheme}
      />

      {/* The one global offline indicator. Two independent things can put the app in this
          state, and either is enough:
            - the device reports no network (navigator.onLine, useOnlineStatus)
            - a real request found the server unreachable (lib/connectivity.ts)
          The second is the one that matters when the API is stopped but the wifi is fine.
          An HTTP business error — 401/403/404/409 — is deliberately NOT offline: the server
          answered, and labelling a private event "OFFLINE" would hide the real reason.

          It clears itself: the next request that reaches the server flips serverReachable back
          and bumps reconnectNonce, which is what makes the pages refetch. No copy about queued
          changes — there is no mutation queue in this app, and a failed write stays failed. */}
      {!connected && (
        <div className="banner banner--offline" role="status">
          OFFLINE — showing last synced data
        </div>
      )}

      <main className="app-main">{children}</main>

      <footer className="app-footer">
        <span>© {new Date().getFullYear()} El Niño Move. All rights reserved.</span>
      </footer>
    </div>
  );
}
