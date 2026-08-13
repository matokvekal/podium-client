# Bike Podium client — start here

The rider- and organizer-facing PWA. React 19 + TypeScript + Vite.

**State:** foundation only. Sign-in, the app shell, routing, design tokens, the API client
and joining an event by code are real. Every other screen is a documented placeholder
naming the milestone and the endpoints it waits for — see
[../plan/01-task-list.md](../plan/01-task-list.md).

## Read order

1. this file
2. `src/App.tsx` — every route, and the two gates in front of them
3. the page file you actually care about — each one starts with what it is for, its route,
   what it loads, what it does and which endpoints it calls
4. [../plan/07-api-contract.md](../plan/07-api-contract.md) before touching anything that
   talks to the server

## Getting it running

```bash
npm install
cp .env.example .env   # VITE_API_URL and VITE_GOOGLE_CLIENT_ID at minimum
npm run dev            # http://localhost:5173
```

The server must be running, and its `CORS_ORIGINS` must include `http://localhost:5173`.
`VITE_API_URL` must match the port the server actually logged on startup (`6500` in
`podium-server/.env.example`) — a mismatch shows up as *"Could not reach the server"* on the
login screen and nothing more specific.

The login screen shows the app version from `package.json` (baked in by `vite.config.ts` as
`__APP_VERSION__`, read via `config.appVersion`), so bump `version` there when it matters.

```bash
npm run typecheck
npm run lint
npm test
```

## Layout

```text
src/
  main.tsx              mounts the app, registers the service worker (production only)
  App.tsx               routes, RequireAuth, the profile gate
  app/
    AppShell.tsx        header, navigation, the offline banner
    display-mode.ts     standard | competition — presentation only
    NotBuiltYet.tsx     honest placeholder, names the milestone
  auth/
    AuthContext.tsx     who is signed in; the only place tokens are set
    google-signin.ts    loads Google Identity Services on demand
  lib/
    api-client.ts       the only way this app talks to the server
    auth-storage.ts     where the tokens live between page loads
    config.ts           VITE_* settings, including the tile URL
    time.ts             UTC in, the viewer's own timezone out
    useOnlineStatus.ts
  pages/                one file per screen, documented at the top
  styles/
    tokens.css          colours, type, spacing, and the two display modes
    global.css          shell layout and shared classes
public/
  manifest.webmanifest  installable PWA metadata
  service-worker.js     app shell + tiles cached; the API never is
```

## Conventions

- **One file per screen**, and it opens with its own documentation block. An instruction
  like *"on the live map page, keep only name, status and last position in the rider
  panel"* should land in exactly one file.
- **Only `lib/api-client.ts` calls the server.** It owns the bearer token, the single
  in-flight refresh, and turning a response into an `ApiError`.
- **Real status codes matter.** 401 means sign in again, 403 means not permitted, and
  **409 means an offline action was already applied — that is a success**, not an error to
  show a rider.
- **Every timestamp from the API is UTC.** Convert with `lib/time.ts` and nothing else.
  Never send a local time back.
- **Leaflet stays lazily loaded.** `LiveMapPage` is the only entry point; importing it
  eagerly took Commissaire's bundle from 65 kB to 559 kB.
- **Display mode is presentation only** — never data, permissions or lifecycle.
- Names describe the domain: `EventListPage`, `LiveMapPanel`, `RouteBrowser`. Not `utilX`.

## ⚠ Temporary code that must be deleted before production

The login screen has a **Developer sign-in** block that bypasses authentication and signs in
as a fake user via `POST /auth/dev-login`. It renders only when two independent switches
agree: `config.devLoginEnabled` (`import.meta.env.DEV`, so it is compiled out of any
production build) and the server reporting `devLogin: true` from `/auth/config`.

Client-side pieces, all commented `TEMPORARY DEVELOPMENT AID — DELETE BEFORE PRODUCTION`:

- `src/pages/LoginPage.tsx` — the developer sign-in block, `devSignIn`, `serverDevLogin`
- `src/auth/AuthContext.tsx` — `signInAsDevUser`
- `src/lib/config.ts` — `devLoginEnabled`

The server half and the combined removal checklist are in
[../podium-server/README.md](../podium-server/README.md#-developer-sign-in--temporary-delete-before-production).
Delete both halves together, and do not build anything on top of it.

## Things that are deliberately not here

- **GPS transmission.** The Android app is the only GPS source in v1. This app displays
  positions; it never sends them.
- **A component library.** Tokens plus a handful of shared classes, until a real need
  appears.
- **A state-management library.** Context for auth, local state for everything else.
- **SOS beyond a blinking marker.** The name, the emergency phone, notifications and a
  history view are all later work — see [../AGENT.md](../AGENT.md).

## When to update this file

Whenever a screen becomes real, a convention changes, or something moves out of the "not
here" list.
