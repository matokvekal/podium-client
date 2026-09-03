import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { SplashScreen } from "./app/SplashScreen";
import { AuthProvider } from "./auth/AuthContext";
import { applyColorTheme, getInitialColorTheme } from "./lib/color-theme";
import "./styles/global.css";

// Stamp data-color-theme before the first paint, not from a component effect.
//
// tokens.css falls back to the dark palette under `@media (prefers-color-scheme: dark)` for as
// long as the attribute is ABSENT (`:root:not([data-color-theme])`), so a dark-phone rider used
// to get a frame or two of dark before AppShell's effect wrote "day" over it. Two screens made
// that worse than a flicker: sign-in and Terms render outside AppShell entirely, so nothing ever
// applied the attribute there and they stayed dark whatever the rider had chosen.
//
// AppShell still owns the toggle and re-applies on change; this only settles the starting state.
applyColorTheme(getInitialColorTheme());

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing from index.html");

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        {/* The app-wide safety net. React unmounts the ENTIRE tree when a render or an
            effect throws with nothing to catch it, and this app had no boundary at all —
            so one component's bug did not break that component, it blanked the whole PWA
            to a white screen carrying no information. Screens and modals should still
            carry their own closer boundary; this is the backstop, not the plan. Inside
            AuthProvider so the fallback can still be themed and the session survives. */}
        <ErrorBoundary title="The app hit a problem">
          <App />
        </ErrorBoundary>
        {/* Overlays everything above via z-index for 3s, then removes itself. The app
            underneath is already mounting and loading in parallel, not waiting on this. */}
        <SplashScreen />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

// The service worker makes the shell open with no network. It is registered after load so
// it never competes with the first render, and only in production — in dev it would serve
// stale bundles back at you.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch((err) => {
      console.warn("Service worker registration failed", err);
    });
  });
}
