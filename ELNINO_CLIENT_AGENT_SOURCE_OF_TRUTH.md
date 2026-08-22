# ElNino Client — Agent Source of Truth

> Concise frontend reference for coding agents.
> Current client rules only. Historical notes, completed bug narration, duplicate explanations,
> and obsolete implementation status are intentionally omitted.

## 1. Scope

ElNino Client is the rider/organizer PWA.

```text
React 19
TypeScript
Vite
Zustand
IndexedDB
Leaflet
PWA / Service Worker
```

Client responsibilities:
- UI/UX
- routing and route guards
- local/page state
- offline/read cache
- rendering server capabilities
- event, route, participant, results and live views
- converting UTC timestamps for display

Client is **not** the authority for:
- authorization
- plan limits
- event ownership rules
- participant approval rules
- lifecycle transitions
- persistent server data

Server/DB data wins over local/cache/mock state.

---

## 2. Agent Rules

1. Work only in client `src/`, `public/`, tests and client config unless explicitly asked otherwise.
2. Keep changes small and focused.
3. Preserve existing UI patterns and API contracts.
4. Do not modify server code from a client task.
5. Do not rename public API fields/routes unless explicitly requested.
6. Do not add dependencies unless necessary.
7. Prefer existing components, stores and `lib/` helpers.
8. Do not recreate server authorization logic in the client.
9. Do not introduce mock fallback into server-backed production flows.
10. One screen should normally have one page file with its screen-specific behavior.

Before DONE:

```bash
npm run typecheck
npm run lint
npm test
```

For a focused task, targeted tests/checks may be run during development, but release verification uses all three.

---

## 3. Application Structure

```text
src/
  main.tsx
  App.tsx

  app/
    AppShell.tsx
    AppDrawer.tsx
    SplashScreen.tsx
    EventCard.tsx
    EventTile.tsx
    EmptyRidesState.tsx
    event-visuals.ts
    RouteMap.tsx
    RiderResultRow.tsx
    TrackMap.tsx
    TrackCard.tsx
    display-mode.ts

  auth/
    AuthContext.tsx
    google-signin.ts

  lib/
    api-client.ts
    auth-storage.ts
    local-db.ts
    config.ts
    country-flag.ts
    time.ts
    useOnlineStatus.ts

  store/
    eventsStore.ts
    resultsStore.ts
    tracksStore.ts

  pages/
    one main file per screen

  styles/
    tokens.css
    global.css

public/
  manifest.webmanifest
  service-worker.js
```

---

## 4. Data Access Rule

**Only `src/lib/api-client.ts` talks to the real server.**

It owns:
- bearer token
- refresh handling
- one in-flight refresh
- API error normalization

Do not scatter `fetch()` calls through pages/components.

Expected flow:

```text
Page / Component
      ↓
Store or feature action
      ↓
api-client.ts
      ↓
Server
```

---

## 5. State Management

Use the smallest correct state scope:

```text
AuthContext       signed-in user/session lifecycle
Zustand store     data shared across navigation/page lifetime
useState          page-local UI/form/search/sort state
IndexedDB         offline/read cache below the store
Server            persistent source of truth
```

Important:
- IndexedDB is a cache, not a replacement for Zustand or server state.
- On refresh/login, server-backed state must be reloadable.
- Local stale state must not override newer server state.
- Personal user data must be cleared on logout where appropriate.

Current logout behavior:
- Sign out action is in `AppDrawer.tsx`.
- `AuthContext.signOut()` clears personal rides.
- `eventsStore.loadMyRides()` repopulates them after the next login.

---

## 6. Authentication

Authentication state belongs in `AuthContext`.

Google sign-in support is loaded on demand.

Tokens are stored through:

```text
src/lib/auth-storage.ts
```

API authentication/refresh behavior belongs only in:

```text
src/lib/api-client.ts
```

### Temporary development login

Development authentication exists only for local development and must be removed before production.

Two forms may exist:

```text
Server-backed dev login
POST /auth/dev-login

Client-only local dev user
signInAsLocalDevUser
```

Relevant client areas:

```text
src/pages/LoginPage.tsx
src/auth/AuthContext.tsx
src/lib/config.ts
```

Do not build production features that depend on development login.

---

## 7. Server Authorization Contract

The client **renders capabilities** returned by the server.

Do not implement logic such as:

```ts
if (user.plan === "pro") { ... }
if (user.role === "owner") { ... }
```

when the server already provides a capability answer.

Typical account capabilities:

```text
event:create
event:create_private
team:create
route:create
route:publish
```

Typical event capabilities:

```text
event:view
event:view_details
event:view_route
event:view_participants
event:view_live
event:view_results
event:view_history
event:join
event:edit
event:change_status
event:delete
event:manage_participants
event:manage_groups
event:manage_route
event:manage_members
```

Client responsibility:

```text
capability exists → render/enable action
capability absent → hide/disable action
```

Server remains responsible for enforcing it.

---

## 8. HTTP Semantics

Real HTTP status codes matter:

```text
401  authentication/session problem
403  authenticated but not permitted
404  resource unavailable/hidden/not found
409  conflict; may represent an already-applied offline action
429  rate limited
```

Important offline rule:

**409 for an already-applied replayed action may be success**, not a user-facing failure.

Use normalized `ApiError` handling from `api-client.ts`.

---

## 9. Time Rules

Every timestamp received from the API is UTC.

Use only:

```text
src/lib/time.ts
```

for display conversion.

Rules:
- API UTC → viewer local timezone for display.
- Never send display-local time back as if it were UTC.
- Do not create ad-hoc date conversion logic in pages.

---

## 10. Events

Main client event surfaces include:

```text
My Rides
Find Rides
Find Races
Event Create
Event Edit
Event Detail
Participants
Results
Live
```

Event data that exists on the server must come from the API/store, not hardcoded/mock fallback.

### Event cards

Shared visual logic belongs in:

```text
EventCard.tsx
EventTile.tsx
event-visuals.ts
```

Do not independently recreate status labels/colors/placeholders in every page.

`EventTile` is the larger My Rides style.

`EventCard` is the list/row style used by discovery/see-all surfaces.

### Display mode

```text
standard
competition
```

Display mode is **presentation only**.

It must not change:
- data
- permissions
- event lifecycle
- server behavior

---

## 11. Join and Approval

Join/approval state is server-backed.

Client rules:
- never invent participant membership;
- never retain stale `pending` after the server reports `approved`;
- refresh must reload authoritative state;
- logout/login must reproduce the same server state;
- duplicate join attempts must not create local duplicate riders;
- creator must not be presented as needing approval for their own administrative access.

Organizer participant UI should clearly distinguish statuses such as:

```text
waiting_approval
approved / registered
rejected
```

After approve/reject:
1. use the server response or refetch;
2. update the store/UI;
3. do not keep an older local status.

---

## 12. Participant Identity and Avatar

Participant identity must come from real API data.

Never generate fake rider names.

Display fallback should remain consistent across:
- participant list
- event detail
- live page
- results where applicable

Preferred identity chain:

```text
nickname
→ firstName + lastName
→ neutral fallback
```

Avatar chain:

```text
provider/profile image
→ users.avatar_url
→ API avatarUrl
→ UI fallback
```

Do not maintain separate identity rules per page.

---

## 13. Routes and Maps

Route data attached to an event is server-backed.

Do not use a fabricated local route when the server route is missing.

Expected flow:

```text
Organizer selects/creates route
        ↓
Client normalizes route
        ↓
API saves/attaches route
        ↓
Server/DB persists
        ↓
Event API returns route
        ↓
Every user sees same route
```

GPX/TCX/CSV parsing may remain client-side.

### Leaflet

Leaflet maps must remain lazy-loaded.

Current map entry points include:

```text
RouteMap.tsx
TrackMap.tsx
```

Use:

```ts
lazy(() => import(...))
```

Do not eagerly import Leaflet into the main bundle without a measured reason.

---

## 14. Live Page

The web client displays GPS data; it does **not** transmit rider GPS in V1.

Android is the GPS source.

Client live responsibilities:
- render route;
- render current rider position;
- render permitted other riders;
- show status/last-position information;
- display emergency/SOS state visually;
- obey server visibility/capability results.

Do not create a web GPS transmitter unless product scope explicitly changes.

---

## 15. Results

Results belong with the event experience.

Use server-backed results when available.

Do not keep a mock results fallback in a production server-backed flow.

Shared rider-result rendering belongs in:

```text
RiderResultRow.tsx
```

The client should render server result/status/ranking data rather than independently recreating race ranking rules.

---

## 16. Find Tracks

Track browsing/planning uses:

```text
tracksStore.ts
TrackCard.tsx
TrackMap.tsx
```

Client-only UI state such as favorites may remain local if intentionally designed that way.

Server-backed route/track information must not be replaced by old mock data.

External data domains such as:
- air quality
- traffic hazards
- POIs

remain separate product integrations and should not be fabricated when no provider exists.

---

## 17. Offline / PWA

The app is an installable PWA.

```text
manifest.webmanifest
service-worker.js
```

Production registers the service worker.

The app shell/map tiles may be cached.

**The API itself must not be blindly service-worker cached.**

Offline/read strategy:

```text
Store
  ↓
IndexedDB cached data
  ↓
network refresh when available
  ↓
server result becomes authoritative
```

Do not let old IndexedDB/mock state overwrite fresh API data.

---

## 18. Styling and Components

Primary styling:

```text
src/styles/tokens.css
src/styles/global.css
```

Use existing design tokens and shared classes before adding one-off styles.

There is intentionally no large component library.

Prefer domain names:

```text
EventListPage
LiveMapPanel
RouteBrowser
```

Avoid generic names such as:

```text
utilX
helper2
thingComponent
```

---

## 19. Current Stabilization Rules

For V1 stabilization:

**No new features until critical real flows are stable.**

Priority client verification:

### Route
- organizer saves/selects route;
- second user receives the exact same server route;
- no stale local/mock fallback.

### Approval
- rider requests join;
- organizer clearly sees pending;
- organizer approves;
- rider sees approved immediately/refetch;
- refresh remains approved;
- logout/login remains approved.

### Creator
- creator is never shown as pending self-approval.

### Participants
- no fake/mock riders;
- only real server participants;
- correct status;
- consistent identity/avatar.

### Logout/login
- clear user-specific local state on logout;
- reload server state on next login;
- no previous user's rides leak into the next session.

### Leave
- leaving must be reflected from server state;
- My Rides must update;
- refresh/login must not resurrect stale membership.

### Live
- route and riders come from server-backed data;
- no mock participant leakage.

---

## 20. Testing Checklist

Before calling a client stabilization task DONE:

```bash
npm run typecheck
npm run lint
npm test
```

Also manually verify relevant real flows.

For join/approval/route/membership changes use **two users**:

```text
User A = organizer
User B = rider
```

Test:
1. create/open event;
2. join;
3. pending state;
4. approve/reject;
5. refresh;
6. logout/login;
7. route equality between users;
8. participant identity/avatar;
9. leave if relevant.

A unit test passing against mock state is not proof that client/server synchronization works.

---

## 21. Production Cleanup

Before first production release:

- remove client dev-login UI and methods;
- confirm production build contains no client-only fake sign-in;
- remove obsolete mock fallbacks from flows that now have real APIs;
- verify API URL/environment configuration;
- verify CORS with production server;
- run production build/typecheck/lint/tests;
- test authentication and core flows against the real server.

---

## 22. Agent Workflow

For each client task:

```text
1. Read this file.
2. Identify the single affected screen/flow.
3. Inspect only relevant page/component/store/api helper.
4. Determine whether data is local or server-owned.
5. Make the smallest safe change.
6. Reuse existing components/stores/helpers.
7. Add/update targeted tests.
8. Verify real client/server behavior if synchronization is involved.
9. Run full checks before DONE.
10. Report:
   - changed files
   - UI behavior changed
   - API/store impact
   - tests/checks run
   - remaining risk
```

---

# Quick Agent Checklist

```text
CLIENT-ONLY CHANGE?
SERVER IS SOURCE OF TRUTH?
NO DUPLICATED AUTHZ LOGIC?
API ONLY THROUGH api-client.ts?
CORRECT STATE SCOPE?
NO MOCK FALLBACK FOR REAL DATA?
UTC HANDLED THROUGH time.ts?
LEAFLET STILL LAZY?
LOGOUT CLEARS USER STATE?
REFRESH RELOADS SERVER STATE?
TWO-USER FLOW TESTED IF NEEDED?
TYPECHECK PASS?
LINT PASS?
TESTS PASS?
```
