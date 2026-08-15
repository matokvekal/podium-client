import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { SplashScreen } from "./app/SplashScreen";
import { AuthProvider } from "./auth/AuthContext";
import "./styles/global.css";

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing from index.html");

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
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
