// The frame every signed-in screen sits in: header, navigation, offline banner.
//
// Navigation is a bottom bar on a phone and a side rail from 768px up — that is what lets
// the map grow on a tablet or a laptop, with the rider list beside it instead of below.

import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useOnlineStatus } from "../lib/useOnlineStatus";

const NAV_ITEMS = [
  { to: "/", label: "Events", end: true },
  { to: "/routes", label: "Routes", end: false },
  { to: "/history", label: "History", end: false },
  { to: "/account", label: "Account", end: false },
];

export function AppShell({ children }: { children: ReactNode }) {
  const online = useOnlineStatus();

  return (
    <div className="app-shell">
      <nav className="app-nav" aria-label="Main">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className="app-nav__link">
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="app-shell__body">
        <header className="app-header">
          <NavLink to="/" className="app-header__brand">
            <img src="/favicon.svg" alt="" width={24} height={24} />
            Bike Podium
          </NavLink>
          <span className="app-header__spacer" />
          <NavLink to="/join" className="button button--quiet">
            Join with a code
          </NavLink>
        </header>

        {!online && (
          <div className="banner banner--offline" role="status">
            Offline — showing what was last loaded. Anything you change is sent when you
            reconnect.
          </div>
        )}

        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
