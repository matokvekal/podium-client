/**
 * Slide-out navigation drawer, opened from the hamburger button in AppShell's header.
 *test
 * Mirrors race-pwa's HeaderMain drawer pattern: an avatar row that says who (if anyone) is
 * signed in, then nav items, then either "Register / Login" or "Account" + "Sign out"
 * depending on that. Deliberately does not carry over race-pwa's theme/language/skin
 * pickers or feature toggles — none of that was asked for here.
 *
 * Signing in is not a gate anywhere this drawer links to: every nav item works for a
 * stranger with no account. Only actions inside those screens (create, join, edit) ask for
 * a sign-in, and only when actually attempted.
 */

import {
  Bike,
  LogOut,
  Map as MapIcon,
  Megaphone,
  Moon,
  QrCode,
  Sun,
  User,
  Users,
  X,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import type { ColorTheme } from "../lib/color-theme";
import { useIsOrganizer, useUserModeStore } from "../store/userModeStore";
import { Avatar } from "./Avatar";
import { useMyIdentity } from "./useMyIdentity";

interface AppDrawerProps {
  open: boolean;
  onClose: () => void;
  colorTheme: ColorTheme;
  onToggleColorTheme: () => void;
}

export function AppDrawer({ open, onClose, colorTheme, onToggleColorTheme }: AppDrawerProps) {
  const { status, signOut } = useAuth();
  const isOrganizer = useIsOrganizer();
  const setUserMode = useUserModeStore((state) => state.setMode);
  const navigate = useNavigate();

  // Name and avatar both come from useMyIdentity so the drawer, the header and the account
  // page always agree about who this is.
  const me = useMyIdentity();
  const displayName = me.displayName;

  function go(path: string) {
    onClose();
    navigate(path);
  }

  return (
    <>
      {open && <div className="drawer-overlay" onClick={onClose} aria-hidden="true" />}

      <div className={open ? "drawer drawer--open" : "drawer"} aria-hidden={!open}>
        <div className="drawer__header">
          <div className="drawer__brand">
            <div className="drawer__brand-name">El Niño Move</div>
            <div className="drawer__brand-tag">Every rider, watched over.</div>
          </div>
          <button type="button" className="drawer__close" onClick={onClose} aria-label="Close menu">
            <X aria-hidden="true" />
          </button>
        </div>

        <div className="drawer__identity">
          <div className="drawer__avatar">
            {me.signedIn ? (
              <Avatar
                className="identity-avatar"
                name={me.displayName}
                identity={me.avatar}
                localSelection={me.localAvatar}
                seed={me.seed}
              />
            ) : (
              <User aria-hidden="true" />
            )}
          </div>
          <div>
            <div className="drawer__identity-name">{displayName}</div>
            <div className="drawer__identity-sub muted">
              {status === "signed-in" ? "Signed in" : "Not signed in"}
            </div>
          </div>
        </div>

        <nav className="drawer__nav" aria-label="Main">
          <NavLink to="/" end className="drawer__nav-item" onClick={onClose}>
            <Bike aria-hidden="true" />
            My Rides
          </NavLink>
          {isOrganizer && (
            <NavLink to="/routes" className="drawer__nav-item" onClick={onClose}>
              <MapIcon aria-hidden="true" />
              Find Tracks
            </NavLink>
          )}
          {status === "signed-in" && (
            <NavLink to="/teams" className="drawer__nav-item" onClick={onClose}>
              <Users aria-hidden="true" />
              Teams
            </NavLink>
          )}
          <NavLink to="/join" className="drawer__nav-item" onClick={onClose}>
            <QrCode aria-hidden="true" />
            Join with a code
          </NavLink>

          {/* Mode + View live in the menu list, no bordered panels — asked for directly. */}
          <label className="drawer__nav-item drawer__nav-item--toggle">
            <Megaphone aria-hidden="true" />
            I also organize events
            <input
              type="checkbox"
              className="drawer__nav-check"
              checked={isOrganizer}
              onChange={(event) => setUserMode(event.target.checked ? "organizer" : "rider")}
            />
          </label>

          <button
            type="button"
            className="drawer__nav-item"
            onClick={onToggleColorTheme}
            aria-label={colorTheme === "day" ? "Switch to dark mode" : "Switch to day mode"}
          >
            {colorTheme === "day" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
            {colorTheme === "day" ? "Switch to dark" : "Switch to day"}
          </button>
        </nav>

        <div className="drawer__footer">
          {status === "signed-in" ? (
            <>
              <button type="button" className="drawer__nav-item" onClick={() => go("/account")}>
                <User aria-hidden="true" />
                Account
              </button>
              <button
                type="button"
                className="drawer__nav-item"
                onClick={() => {
                  onClose();
                  signOut();
                }}
              >
                <LogOut aria-hidden="true" />
                Sign out
              </button>
            </>
          ) : (
            <button type="button" className="drawer__nav-item" onClick={() => go("/login")}>
              <User aria-hidden="true" />
              Register / Login
            </button>
          )}
        </div>
      </div>
    </>
  );
}
