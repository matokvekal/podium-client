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

import { Menu, User } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useOnlineStatus } from "../lib/useOnlineStatus";
import { AppDrawer } from "./AppDrawer";

export function AppShell({ children }: { children: ReactNode }) {
  const online = useOnlineStatus();
  const { status } = useAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="app-shell">
      <header className="app-header">
        <button
          type="button"
          className="app-header__icon-btn"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
        >
          <Menu aria-hidden="true" />
        </button>

        <NavLink to="/" className="app-header__brand">
          El Niño Move
        </NavLink>

        <button
          type="button"
          className="app-header__avatar"
          aria-label={status === "signed-in" ? "Account" : "Sign in"}
          onClick={() => (status === "signed-in" ? navigate("/account") : setDrawerOpen(true))}
        >
          <User aria-hidden="true" />
        </button>
      </header>

      <AppDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {!online && (
        <div className="banner banner--offline" role="status">
          Offline — showing what was last loaded. Anything you change is sent when you reconnect.
        </div>
      )}

      <main className="app-main">{children}</main>

      <footer className="app-footer">
        <span>© {new Date().getFullYear()} El Niño Move. All rights reserved.</span>
      </footer>
    </div>
  );
}
