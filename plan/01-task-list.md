# Bike Podium Task List

The execution backlog. Update it whenever a task's status changes.

## Status legend

- `[ ]` not started
- `[~]` in progress
- `[x]` done

---

## Milestone 0 — Project setup ✅

- [x] Create workspace structure for client and server
- [x] Create planning folder and base product documentation
- [x] Define project principles and MVP scope
- [x] Document the reference workflow from Commissaire
- [x] Add the existing server to [server-podium](../server-podium)
- [x] Document the frozen Android API contract
- [x] Reconcile the schema with the live database

---

## Milestone 1 — Server foundation ← **written, not yet verified**

Full detail: [11-prisma-removal.md](11-prisma-removal.md). Do this before any
feature work — every new module written on Prisma is more to convert later.

Prisma is gone from the code. **Nothing has been installed, run or migrated yet** —
[QUESTIONS.md](QUESTIONS.md) items 1 and 2 are blockers and come before anything below.

- [ ] Back up the production database
- [x] Add `pg` pool and `src/db/pool.ts`
- [x] Convert `otp.service.ts` to SQL
- [x] Convert `session.service.ts` + `token.service.ts`
- [x] Convert `user.service.ts` + `user.controller.ts`
- [x] Convert `auth.service.ts`
- [x] Convert `event.service.ts`
- [x] Clean up `requireAuth.ts`, `jwt.ts`, `server.ts` (`pool.end()` on shutdown)
- [x] Replace `tests/support/fake-prisma.ts` with a fake pool (`tests/support/fake-db.ts`)
- [x] Create hand-written `server-podium/sql/*.sql`
- [x] Delete `prisma/`, drop deps and `db:*` scripts
- [x] Add the missing `tsconfig.json` — referenced by the build scripts but absent
- [x] **`npm install`, then `npm test` + `typecheck` + `lint` green** — verified
      2026-08-14 against a local dev database: 68/68 tests pass, typecheck clean;
      `lint` shows only pre-existing CRLF/LF formatting diffs, no logic errors. See
      [03-progress.md](03-progress.md)
- [ ] **Migrate all timestamps to `TIMESTAMPTZ` with `AT TIME ZONE 'UTC'`** ⚠
      — `sql/900-timestamptz-migration.sql`, written but **not run**️
- [ ] Verify known rows read the same instant after migration
- [ ] **Verify the real Android app still joins and transmits** ⚠️
- [ ] Verify an offline batch arrives with original timestamps
- [x] Rate-limit the location endpoint per user, not per IP
- [ ] Remove the `prisma generate` step from the deploy workflow — that file is not in
      this repo ([QUESTIONS.md](QUESTIONS.md) item 4)
- [ ] Confirm the exposed `serviceAccountKey.json` was revoked in Google Cloud

---

## Milestone 2 — Events and ownership ✅ (found already built, 2026-08-14)

This whole milestone turned out to already be implemented in `podium-server/src/modules/events/`
— none of it was reflected here before 2026-08-14, which made the plan badly out of date with
the code. Verified by reading the actual source, not just trusting old checkboxes again.

- [x] `owner_id` on `events`
- [x] Set on every event at creation (`createEvent`, `event.service.ts`)
- [x] `event_id` on `location_points`, added and backfilled in `sql/002-events-podium.sql`
- [x] `status`, `visibility`, `display_mode`, `description`, `location`, `finished_at`
- [x] The six `show_*` visibility columns (`updateEventSchema` in `event.schemas.ts`)
- [x] `is_active` kept in sync with `status` (`isActiveForStatus`, `event.service.ts:122`)
- [x] `POST /events` — create
- [x] `GET /events` — my events, filterable (`mine`, `joined`, `upcoming`, `live`, `past`)
- [x] `GET /events/:id` — detail, respecting visibility (private events 403 a non-owner)
- [x] `PATCH /events/:id` — edit
- [x] `DELETE /events/:id`
- [x] `GET /events/public` — unauthenticated, paged. As of 2026-08-14 this is also what
      powers the client's signed-out home screen — see `EventsListPage.tsx`
- [x] Event status workflow, transition graph validated in `changeEventStatus`

Not yet verified: whether the transition graph matches
draft → published → ready → live → finished exactly, or allows more than that. Worth a
closer read before relying on it for milestone 3+.

## Milestone 3 — Roles and permissions *(later — owner first)*

Owner-only permissions are enough to ship. This milestone is about letting an
owner **give other people** permission to operate the event. Deliberately after
the core flow works.

- [ ] `event_members` table
- [ ] Permission checks in services: owner / operator / viewer
- [ ] Member endpoints (list, add, change role, remove)
- [ ] Enforce per-event visibility on every read endpoint
- [ ] Confirm `users.role` stays a global flag and is never used per event

## Milestone 4 — Participants

- [ ] Make `event_participants.user_id` nullable
- [ ] Add `name`, `email`, `phone`, `category`
- [ ] Add `registration_status`, `attendance_status`, `result_status`
- [ ] Add `finished_at`, `finish_position`
- [ ] CRUD endpoints
- [ ] Approval workflow: registered → waiting_approval → approved
- [ ] Attendance marking (present / dns)
- [ ] Mark finishers (result_status + finish time + position)
- [ ] Excel / CSV import endpoint
- [ ] Reuse the Commissaire import wizard on the client

## Milestone 5 — Routes and tracks

- [ ] `routes` + `event_routes` tables
- [ ] Route parser: GPX, TCX, JSON, GeoJSON — reuse `parseTrack.ts`
- [ ] Compute distance, elevation, start/end, bbox, preview points at upload
- [ ] `POST /routes` — upload
- [ ] `GET /routes` — my routes
- [ ] `GET /routes/public` — paged, filterable library
- [ ] `GET /routes/:id` — full geometry
- [ ] Publish / unpublish a route
- [ ] Attach a route to an event
- [ ] Draw-a-route-on-the-map builder
- [ ] Public route browser with map preview cards

## Milestone 6 — Live tracking

- [ ] `participant_last_location` table
- [ ] Upsert it on ingest, newer points only
- [ ] `GET /events/:id/live` — reads only the last-location table
- [ ] `GET /events/:id/live/:participantId` — rider detail
- [ ] Rider search and locate on the map
- [ ] Distance travelled
- [ ] Distance from me
- [ ] Polling strategy on the client (10–15 s)

### Map work

- [ ] Set up Leaflet, **lazy-loaded**, with OSM tiles
- [ ] Put the tile URL in config (`VITE_TILE_URL`) so the provider is swappable
- [ ] Draw the event route as a polyline
- [ ] Rider markers using `L.divIcon` (needed for custom HTML/CSS)
- [ ] **Update markers in place on each poll — never clear and redraw** (flicker,
      and it loses the user's pan/zoom)
- [ ] Marker states: normal / stale / finished / **SOS**
- [ ] **SOS v1: red blinking marker only** — CSS animation, honouring
      `prefers-reduced-motion`. Nothing else.
- [ ] **Tap a rider → our own React modal** with name, bib, status, last update,
      distance travelled, distance from me
- [ ] Show all times in the **viewer's local timezone** (API sends UTC)
- [ ] Responsive: bigger map on tablet and desktop, list beside it not below
- [ ] Check tile usage against OSM's policy; move to a free-tier keyed provider
      (Stadia / MapTiler / Thunderforest) if traffic requires it

## Milestone 7 — Finish and history

- [ ] `participant_tracks` table
- [ ] Write tracks on event finish
- [ ] Retention job for `location_points`, guarded by tracks existing
- [ ] `GET /events/:id/tracks`
- [ ] Results view — finish time and position
- [ ] History screen

## Milestone 8 — Client foundation ← **scaffolded, not yet installed**

Written alongside milestone 1 so the two ends could be checked against each other. Same
caveat: `npm install` has not run, so none of it has been executed.

- [x] Initialize React + TypeScript + Vite in [client-podium](../client-podium)
- [x] Routing and app shell (`src/App.tsx`, `src/app/AppShell.tsx`)
- [x] Design tokens for the two visual styles (`src/styles/tokens.css`)
- [x] PWA configuration — manifest and a hand-written service worker
- [x] API client with token storage and refresh (`src/lib/api-client.ts`)
- [x] Google sign-in flow, plus SMS sign-in and the profile gate
- [x] Responsive layout — bottom bar on a phone, side rail from 768px so the map can grow
- [x] Join an event by code or QR link (`src/pages/JoinPage.tsx`)
- [x] `npm install`, then typecheck + lint green — verified 2026-08-14; typecheck clean,
      `lint` shows only pre-existing CRLF/LF formatting diffs
- [ ] App icons — the manifest points at three PNGs that do not exist yet
      ([QUESTIONS.md](QUESTIONS.md) item 8)

## Milestone 9 — Client screens

- [~] Events list — real, uncommitted work in the tree as of 2026-08-14
      (`src/pages/EventsListPage.tsx`, calls `GET /events?filter=`)
- [~] Event create / edit — real, uncommitted work in the tree as of 2026-08-14
      (`src/pages/EventCreatePage.tsx`)
- [~] Event detail — real, uncommitted work in the tree as of 2026-08-14
      (`src/pages/EventDetailPage.tsx`)
- [ ] Participants
- [ ] Route selection + public route browser
- [ ] Live map (Leaflet, lazy-loaded)
- [ ] History
- [ ] Join by link / code / QR

## Milestone 10 — Offline

- [ ] Local cache of event data
- [ ] Action queue with `X-Client-Action-Id`
- [ ] `client_actions` table and 409 handling
- [ ] Retry on reconnect
- [ ] Verify the whole flow with the network off

## Later — not v1

Recorded so they are not forgotten and not accidentally built early.

- [ ] SOS: show rider name and emergency phone at their location
- [ ] SOS: pin those riders to the top of the rider list
- [ ] SOS: notifications to organizers or other riders
- [ ] SOS history view
- [ ] iOS transmitter
- [ ] Location sharing from the PWA
- [ ] Offline map tiles for a route corridor
- [ ] Laps, waves, category scoring

## Milestone 11 — Quality and privacy

- [ ] Location consent flow before any transmission
- [ ] User-facing retention statement
- [ ] One-tap stop sharing
- [ ] Rules catalog with stable RULE-IDs
- [ ] Integration tests for the event workflow
- [ ] Permission boundary review
- [ ] Load check with many participants

---

## Notes

- [07-api-contract.md](07-api-contract.md) Part 1 is **frozen** — the Android app
  is live against it.
- Verify against the real Android app, not only curl.
- `examples/` is read-only.
