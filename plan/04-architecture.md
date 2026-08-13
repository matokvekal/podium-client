# Bike Podium Architecture

## High-level architecture

```text
Bike Podium PWA (React)              Android Transmitter (exists, live)
    |                                     |
    | Google login -> JWT                 | Google/SMS login -> JWT
    | polling for live positions          | GPS batches, queued when offline
    v                                     v
        Express 5 + TypeScript API  (server-podium)
            |
            +--> auth      (exists) Google + SMS, JWT, rotating refresh
            +--> users     (exists) profile
            +--> events    (partial) by-code, join, locations/batch
            +--> members   (new)  per-event roles
            +--> routes    (new)  upload, draw, browse, reuse
            +--> tracking  (new)  live positions, saved tracks
            +--> results   (new)  finish time and position
            |
            +--> PostgreSQL (plain SQL, no ORM)
```

**The server already exists and is deployed.** See
[03-progress.md](03-progress.md) for exactly what works today and what does not.

## The rule that outranks the others

**The Android transmitter is live and must keep working.**

Its endpoints, JSON field names, and the meaning of `participantId` are frozen —
see [07-api-contract.md](07-api-contract.md) Part 1. Any design that requires
changing the app is the wrong design. Everything internal is free to change.

## Architecture principle

The architecture must stay intentionally straightforward.

- one frontend app
- one backend app
- one database
- clear module boundaries
- thin controllers, business logic in services, SQL in query files
- no hidden cross-layer magic
- no deep abstraction layers for v1

---

## Backend architecture

### Actual structure (as it exists)

```text
server-podium/
  src/
    app.ts                    middleware chain + route mounting
    server.ts                 process entry, graceful shutdown
    config/env.ts             validated env, fails fast on bad config
    db/                       database access
    lib/
      api-error.ts            ApiError(status, message)
      crypto.ts  duration.ts  google-auth.ts  jwt.ts  logger.ts
    middleware/
      requireAuth.ts          verifies access token, sets req.auth
      error-handler.ts  not-found.ts
    modules/
      auth/     { routes, controller, service, schemas, token, session }
      users/    { routes, controller, service, schemas }
      events/   { routes, controller, service, schemas, event-code }
      sms/      { otp.service, phone, sms-provider, mock-sms-provider }
  tests/                      vitest
```

New modules follow the same five-file shape:

```text
modules/<name>/
  <name>.routes.ts       paths + middleware
  <name>.controller.ts   parse, validate, call service, respond
  <name>.service.ts      business logic
  <name>.queries.ts      SQL only            <- new layer, replaces Prisma
  <name>.schemas.ts      zod
```

### Request pattern

1. route receives the request
2. `requireAuth` verifies the token (stateless — no database call)
3. controller validates the body with zod
4. service handles business logic and permissions
5. query file runs SQL with bind parameters
6. response returned

Do not add layers or indirection beyond this.

### Database access — plain SQL, no ORM

Prisma is being removed; see [11-prisma-removal.md](11-prisma-removal.md).

- `pg` driver, a shared pool in `src/db/pool.ts`
- SQL lives **only** in `<module>.queries.ts` — never in controllers or services
- always bind parameters (`$1`, `$2`); never concatenate SQL
- database is `snake_case`, API is `camelCase`; map at the query-file boundary
- schema lives in hand-written `server-podium/sql/*.sql`, run by hand

### Middleware chain (already in place)

`trust proxy 1` → `helmet` → `pino-http` → request id → `cors` (allowlist) →
`express.json({ limit: "100kb" })` → `rateLimit` → routes → `notFound` →
`errorHandler`.

`trust proxy` is set to exactly one hop — the nginx reverse proxy — so
`express-rate-limit` can read `X-Forwarded-For` without clients being able to
spoof it. Do not raise it.

### HTTP status codes — a deliberate divergence

We return **real** status codes: 400, 401, 403, 404, 409, 429, 500.

`examples/old-example servers/server a` follows a rule of *"never return anything
but 200, and 500 only inside a catch"*. **We deliberately reject that rule.** The
PWA has to distinguish:

- **401** → the token expired, re-login
- **403** → valid token, not permitted, show a message
- **409** → this offline action was already applied, treat as success

The offline sync design depends on 409. Collapsing everything to 200 would make
these indistinguishable. This is a conscious choice — do not "restore
consistency" later.

### Conventions kept from the reference servers

From `examples/old-example servers` (a + b), all already present:

- zod schema per endpoint, in `<module>.schemas.ts`
- `helmet`, CORS allowlist, rate limiting
- request logging with a request id
- one central error handler
- **no SQL in controllers**
- validated, fail-fast environment config

---

## Live tracking

### Three tables, three lifetimes

This is the core design decision. Full DDL in
[02-database-schema.md](02-database-schema.md).

| Table | Job | Lifetime |
|---|---|---|
| `location_points` | raw GPS as the app sends it | **purged** after the retention window |
| `participant_last_location` | one row per rider — "where is everyone now" | overwritten continuously |
| `participant_tracks` | simplified ride line, written once at finish | **kept forever** |

### Ingest

```text
POST /events/:eventId/locations/batch   (up to 200 points)
  -> verify participant belongs to caller AND to the event
  -> INSERT the batch into location_points
  -> UPSERT participant_last_location, but ONLY if newer
```

The "only if newer" guard matters: a rider leaving a dead zone uploads a batch of
old points, and those must not drag their marker backwards on the map.

### Live read

```text
GET /events/:eventId/live
  -> reads participant_last_location ONLY
  -> never touches location_points
```

This is what keeps the live map fast at 1000 riders. Polling first; the contract
is shaped so SSE or WebSocket can replace polling later without redesign.

### Finish

Finishing an event writes `participant_tracks` from the raw points. **The
retention cleanup must never run for an event whose tracks have not been
written** — losing a track is the one outcome the whole design exists to prevent.

### SOS

Points carry an `emergency` flag. When set, the live response flags that rider so
the map can **blink their marker red**.

**That is the whole of v1.** Showing the rider's name and `emergency_phone`,
pinning them in the list, notifications, and an SOS history are all deliberately
later. The flag is stored on every point, so none of that data is lost in the
meantime.

### Rate limiting ⚠️

The global limit is 300 requests / 15 min **per IP**. Riders on mobile networks
share carrier NAT addresses, so at a large event many real riders look like a
single IP and get throttled.

The location endpoint needs its own limiter keyed on `req.auth.userId`.

---

## Frontend architecture

Not started. [client-podium](../client-podium) is empty.

### Screens

- login
- events list
- event create / edit
- event detail
- participants
- route selection and the public route browser
- live map
- history
- account

### Responsibilities

- render and manage events, participants, routes
- display live rider positions by polling
- cache key event data locally
- queue user actions when offline and replay them on reconnect
- keep the interface compact and practical

### Visual modes

Two, and they are **presentation only** — never data or lifecycle:

1. `standard` — calm and minimal, the default
2. `competition` — denser, stronger status emphasis, for races and timed events

### Screen sizes

The map is the main object on the live screen and the route browser. On tablet
and desktop it gets **noticeably bigger**, with the rider or route list beside it
rather than stacked underneath.

### Map

**The library and the tiles are separate concerns.**

- **Leaflet** draws the map — open source, free forever, no account, no key.
- **Tiles** are the background images. This is the only part that can cost money.

Decision: **Leaflet + OpenStreetMap tiles**, with the tile URL in config
(`VITE_TILE_URL`) so a provider swap is one line. Already proven in
`examples/old-commissire/src/app/components/map/RaceMap.tsx`.

**Not Google Maps** — it requires a billing account with a credit card, charges on
overage, and its terms forbid caching tiles, which rules out any future offline
map work. Rejected on cost and licensing, not quality.

The public OSM tile server is intended for modest traffic; if usage limits become
a problem, move to a free-tier keyed provider (Stadia, MapTiler, Thunderforest —
all free without a card). Thunderforest's OpenCycleMap and the CyclOSM style show
cycle routes, which suits this product better than a generic road map.

**Everything on top of the tiles is ours** and is unaffected by the tile choice:
the route polyline, one marker per rider polled every 10–15 s, SOS markers
blinking red via a CSS-animated `L.divIcon`, and a tap handler opening our own
React detail modal. See [08-routes-and-maps.md](08-routes-and-maps.md).

**Leaflet must stay lazy-loaded** (`lazy(() => import(...))`). Commissaire records
that importing it eagerly took the bundle from 65 kB to 559 kB.

---

## Offline strategy

### Frontend

- cache recent event data so pages stay usable through an outage
- queue mutating actions and replay on reconnect
- every mutating request carries `X-Client-Action-Id` so a replay cannot apply
  twice; the server answers a duplicate with 409 and the client treats it as
  success

### Transmitter (already implemented)

- collects GPS points locally with no network
- uploads in batches of up to 200 on reconnect
- preserves the original `recordedAt`; the server stores `received_at` separately

```text
GPS lock -> local queue -> no signal -> keep collecting
         -> reconnect -> upload batches -> server accepts delayed timestamps
```

---

## Design constraints

- no ORM
- no microservices
- no Redis requirement for v1
- no table-per-event
- no WebSockets until polling actually proves insufficient
- no changes to the frozen Android endpoints

## Implementation priority order

1. remove Prisma, migrate timestamps ([11-prisma-removal.md](11-prisma-removal.md))
2. event ownership and CRUD
3. per-event roles and visibility
4. participants: status, approval, Excel import
5. routes and the route browser
6. live positions and the map
7. finish, results, history tracks
8. offline robustness

## Important product principle

The system is not only race timing. It is a general event platform for cycling
activities, with real-time rider tracking as a valuable but optional capability.
