# Bike Podium client — start here

The rider- and organizer-facing PWA. React 19 + TypeScript + Vite.

**State:** foundation plus early screens. Sign-in, the app shell, routing, design tokens, the
API client, joining an event by code, the home screen (My Rides / Find Rides / Find Races /
Track tabs), event create/edit/detail (with route map + rider results inline, no separate
page), and Find Tracks (the route planner at `/routes`) are real — all still uncommitted as of
2026-08-14. Event results and Find Tracks are both built against mock data
(`lib/mock-results.ts`, `lib/mock-tracks.ts`) until the server has them; see
[../plan/server-tasks.md](../plan/server-tasks.md) for exactly what that needs — including
three integrations with no chosen provider yet (air quality, traffic hazards, POIs).
Participants and live tracking are still unbuilt — their placeholder pages were deleted rather
than kept as stubs; see [../plan/01-task-list.md](../plan/01-task-list.md) for what's left.

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
`podium-server/.env.example`) — a mismatch shows up as _"Could not reach the server"_ on the
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
  App.tsx               routes, RequireAuth, OpenHome, the profile gate
  app/
    AppShell.tsx        header (Top Bar), the offline banner
    AppDrawer.tsx       the slide-out nav opened from AppShell's hamburger
    SplashScreen.tsx    one-time cold-start overlay, purely presentational
    EventCard.tsx       Find Rides / Find Races / Track / See-All row card
    EventTile.tsx       My Rides home-row tile — the large full-bleed card style
    EmptyRidesState.tsx shown when a signed-in rider has no events yet
    event-visuals.ts    shared card logic: status labels/colours, initial+colour placeholder
    RouteMap.tsx        Leaflet single-route map — lazy-loaded, see the convention below
    RiderResultRow.tsx  two-row rider card, inline on EventDetailPage's results section
    TrackMap.tsx        Leaflet multi-track map for Find Tracks — also lazy-loaded
    TrackCard.tsx       single full-card track display, Find Tracks' result pager
    display-mode.ts     standard | competition — presentation only
  auth/
    AuthContext.tsx     who is signed in; the only place tokens are set
    google-signin.ts    loads Google Identity Services on demand
  lib/
    api-client.ts       the only way this app talks to the real server
    auth-storage.ts     where the tokens live between page loads
    local-db.ts         IndexedDB event cache — read-first, refreshed from the network
    mock-results.ts     stands in for GET /events/:id/results — see plan/server-tasks.md
    mock-tracks.ts      stands in for GET /tracks — see plan/server-tasks.md Part B
    country-flag.ts     ISO country code -> flag emoji, no icon assets
    config.ts           VITE_* settings, including the tile URL
    time.ts             UTC in, the viewer's own timezone out
    useOnlineStatus.ts
  store/
    eventsStore.ts      My Rides / Find Rides / Find Races data — see the state-management
                        note below (Track is derived client-side from myRides, no store of
                        its own)
    resultsStore.ts     one event's route + rider results
    tracksStore.ts      Find Tracks' list + filters + client-only favorite state
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
  like _"on the live map page, keep only name, status and last position in the rider
  panel"_ should land in exactly one file.
- **Only `lib/api-client.ts` calls the server.** It owns the bearer token, the single
  in-flight refresh, and turning a response into an `ApiError`.
- **State**: `AuthContext` for who's signed in; `store/*.ts` (Zustand) for data shared across
  a page's lifetime — event lists, results — so it survives navigating away and back without
  refetching; local `useState` for anything page-local (search text, sort order, form
  fields). `lib/local-db.ts` (IndexedDB) sits underneath a store as the offline cache, not a
  replacement for it.
- **Real status codes matter.** 401 means sign in again, 403 means not permitted, and
  **409 means an offline action was already applied — that is a success**, not an error to
  show a rider.
- **Every timestamp from the API is UTC.** Convert with `lib/time.ts` and nothing else.
  Never send a local time back.
- **Leaflet stays lazily loaded.** Two entry points, both `lazy(() => import(...))`:
  `app/RouteMap.tsx` (one route, from `EventDetailPage.tsx`'s inline results section) and
  `app/TrackMap.tsx` (many tracks at once, from `TracksPage.tsx`) — importing either eagerly
  took Commissaire's bundle from 65 kB to 559 kB. Vite dedupes the shared `leaflet` chunk
  between them, confirmed in the production build. `leaflet`/`@types/leaflet` were removed
  from `package.json` when the unbuilt `LiveMapPage` placeholder was deleted, then re-added
  once `RouteMap` became a real consumer — don't let that happen again if both lazy entry
  points are ever deleted at once.
- **Display mode is presentation only** — never data, permissions or lifecycle.
- Names describe the domain: `EventListPage`, `LiveMapPanel`, `RouteBrowser`. Not `utilX`.

## ⚠ Temporary code that must be deleted before production

The login screen has **two** developer sign-ins that bypass authentication:

- **Server-backed** — signs in as a fake user via `POST /auth/dev-login`. Renders only when
  two independent switches agree: `config.devLoginEnabled` (`import.meta.env.DEV`, compiled
  out of any production build) and the server reporting `devLogin: true` from `/auth/config`.
- **Client-only** (`signInAsLocalDevUser`) — fakes a signed-in session entirely on-device, no
  network call at all. Gated only by `config.devLoginEnabled`, so it's compiled out of
  production regardless of what any server reports (confirmed absent from a production build
  by grepping the built bundle). Exists so sign-in-gated screens (like adding a ride) can be
  tested with the server down.

Client-side pieces, all commented `TEMPORARY DEVELOPMENT AID — DELETE BEFORE PRODUCTION`:

- `src/pages/LoginPage.tsx` — both dev sign-in blocks, `devSignIn`, `serverDevLogin`
- `src/auth/AuthContext.tsx` — `signInAsDevUser` and `signInAsLocalDevUser`
- `src/lib/config.ts` — `devLoginEnabled`

The server half and the combined removal checklist are in
[../podium-server/README.md](../podium-server/README.md#-developer-sign-in--temporary-delete-before-production).
Delete both halves together, and do not build anything on top of it.

## Things that are deliberately not here

- **GPS transmission.** The Android app is the only GPS source in v1. This app displays
  positions; it never sends them.
- **A component library.** Tokens plus a handful of shared classes, until a real need
  appears.
- **SOS beyond a blinking marker.** The name, the emergency phone, notifications and a
  history view are all later work — see [../AGENT.md](../AGENT.md).
- **Real backend data for results or tracks.** `resultsStore.ts` and `tracksStore.ts` are
  real; what they load (`lib/mock-results.ts`, `lib/mock-tracks.ts`) is not — see
  [../plan/server-tasks.md](../plan/server-tasks.md). Tracks specifically has three data
  domains — air quality, traffic hazards, POIs — with no real provider chosen at all yet.

## When to update this file

Whenever a screen becomes real, a convention changes, or something moves out of the "not
here" list.
