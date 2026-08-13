# Bike Podium Progress Tracker

This file tracks the current state of the project so work can resume cleanly after
any interruption. **Read this first when you come back.**

Last updated: **2026-08-13** (second update: Prisma removed, client scaffolded)

---

## Where the project stands right now

**A working backend already exists and is deployed.** This was discovered during
the 2026-08-13 documentation review and changes the plan significantly — the
project is not starting from zero.

| Area | State |
|---|---|
| [server-podium](../server-podium) | **Working and deployed**, and now **converted off Prisma** to plain `pg` + hand-written SQL. The deployed build is still the Prisma one — the conversion has not been installed, tested or deployed. |
| Android transmitter | **Working in production.** Joins events, transmits GPS batches, has an SOS button. |
| [client-podium](../client-podium) | **Scaffolded.** React 19 + TypeScript + Vite PWA. Sign-in, app shell, routing, design tokens, API client and join-by-code are written; every other screen is a documented placeholder. Not installed or run. |
| Planning docs | **Complete and reviewed** (this folder). |
| Database | Live, but needs the migrations in [11-prisma-removal.md](11-prisma-removal.md). |

### What the server already does

- Google sign-in and SMS OTP login
- JWT access tokens (15 min) + rotating opaque refresh tokens (30 days), hashed at rest
- session revoke, logout-all, deactivated-user rejection
- `GET /events/by-code/:code` — QR / code lookup, unauthenticated
- `POST /events/join` — idempotent, returns `participantId`
- `POST /events/:eventId/locations/batch` — up to 200 GPS points per request
- helmet, CORS allowlist, rate limiting, pino logging, zod validation, error middleware

### What the server does not do yet

Event ownership (there is no `owner_id` on `events` at all), per-event roles,
visibility settings, participant status/approval/results, routes and tracks, the
live-positions query, history tracks.

---

## Immediate next task

**Install the dependencies and run the checks, then run the timestamp migration.**
Both are in [QUESTIONS.md](QUESTIONS.md) as items 1 and 2 — they need a decision
from the owner, not more code.

```bash
cd server-podium && npm install && npm test && npm run typecheck && npm run lint
cd ../client-podium && npm install && npm run typecheck && npm run lint
```

The Prisma removal itself ([11-prisma-removal.md](11-prisma-removal.md)) is
**written**: no `@prisma/client` anywhere in `src/`, `prisma/` deleted, SQL owned
by hand in `server-podium/sql/`. What has *not* happened is any execution —
nothing was installed, no test was run, and the database is untouched.

The risky step is still ahead: `sql/900-timestamptz-migration.sql` rewrites every
timestamp in the live database and will silently shift them all by hours if the
`AT TIME ZONE 'UTC'` clause is lost. Back up first, and finish with the real
Android app, not curl.

After that, the build order is in [01-task-list.md](01-task-list.md) — milestone 2,
event ownership, is next.

---

## Decisions made (2026-08-13)

These were settled with the product owner and should not be re-opened without a
reason.

| Decision | Value |
|---|---|
| GPS source | **Android only** in v1. The PWA does not transmit. |
| Event kinds | **Two**: `RIDE`, `RACE`. Already matches the database. |
| Visual styles | **Two**: `standard`, `competition`. Presentation only. |
| "Serious ride" | Not a third kind — it is a style. |
| Retention | Delete **only raw GPS points**. Events, results, routes and saved tracks are kept forever. |
| Android API | **Fixed.** The server matches the app, never the reverse. See [07-api-contract.md](07-api-contract.md). |
| Race results | **Basic only** — finish time and finishing position. No laps, waves, or category scoring. |
| Excel import | **Yes**, reusing the Commissaire import wizard. |
| Routes | **Full feature in v1**, including the public route browser with map previews. |
| ORM | **Remove Prisma.** Plain `pg` + hand-written SQL. |
| Server | **Keep and extend.** Do not rewrite. |
| Server location | `server-podium/` (flattened 2026-08-13). |
| Map library | **Leaflet.** Open source, free forever, no account. |
| Map tiles | **OpenStreetMap**, with the tile URL in config so a provider swap is one line. |
| **Not Google Maps** | Requires a credit card on file, charges on overage, and its terms forbid caching tiles. Rejected on cost and offline grounds, not quality. |
| Live riders on the map | Yes — markers polled every 10–15 s, tap opens a detail modal. All drawn by us; independent of the tile provider. |
| Timezones | Database and API store **UTC only**. Each rider's browser converts to **their own local time** for display. Never store or compare local time. |
| **SOS in v1** | **Red blinking marker only.** Name, phone, notifications and history are explicitly later. The flag is stored on every point so nothing is lost. |
| `events.owner_id` | **Add first.** No event has an owner today; nearly every permission rule depends on it. |
| `location_points.event_id` | **Add.** Makes retention cleanup and per-event export a single statement instead of a join over millions of rows. |
| Roles | **Later.** Owner-only permissions are enough to ship. Granting other people roles comes after the core flow works. |

### Earlier decisions, still standing

- React PWA for the client app
- Node.js + TypeScript + PostgreSQL for the server
- Polling first, not WebSockets, for v1
- One shared location table — never one table per event
- Minimal database constraints; no foreign keys
- `examples/old-commissire` is a UX and code reference only — never edit it
- Clear, explicit names everywhere so bugs are easy to trace
- Folder-level AGENT/README guidance so each area is understandable alone
- Page-level documentation so instructions can target a specific screen

---

## Open items

| Item | Status |
|---|---|
| Revoke the exposed `serviceAccountKey.json` | **Owner is doing this.** It was a **Firebase Admin SDK** key — find it in Google Cloud Console → IAM & Admin → Service Accounts, named `firebase-adminsdk-xxxxx@<project-id>.iam.gserviceaccount.com`, or in Firebase Console → Project Settings → Service Accounts. Delete the key, then test a login. The code no longer uses Firebase at all, so nothing should break. |
| `.git` was left behind when `server-podium/` was flattened | The folder has no git history now. The original repo still has it — that is also where the leaked key can be found in history. |
| `server-podium/README.md` links to `PLAN.md` and `SETUP.md` | Fixed — those links now point at `plan/` and `sql/README.md`. |
| `server-podium/tsconfig.json` was missing | Added, split into `tsconfig.json` (typecheck) and `tsconfig.build.json` (emit). Confirm the settings match what production expects — [QUESTIONS.md](QUESTIONS.md) item 5. |
| The deploy workflow still runs `prisma generate` | It is not in this repo. It must be removed or the next deploy fails — [QUESTIONS.md](QUESTIONS.md) item 4. |
| Transmitter's own `REQUIREMENTS.md` | Referenced in the server code, not present here. Would be useful. |
| Rate limit on the location endpoint | **Fixed** — now keyed on `req.auth.userId`, 120 per 15 min. The number is a guess until the transmitter's real batch interval is known ([QUESTIONS.md](QUESTIONS.md) item 7). |

---

## Workspace state

- [x] [plan](.) folder created and reviewed
- [x] [server-podium](../server-podium) exists and runs
- [x] SQL schema reviewed against the live database
- [x] backend architecture reviewed
- [x] [client-podium](../client-podium) initialized
- [x] frontend architecture reviewed
- [x] Prisma removed from the code
- [ ] dependencies installed and the three checks green ⚠
- [ ] timestamps migrated in the live database ⚠

## Product status

- [x] Product requirements documented
- [x] MVP scope defined
- [x] Event flow defined
- [x] Route flow defined
- [x] Live tracking flow defined
- [x] Offline support strategy defined
- [x] Database schema drafted and reconciled with production
- [x] API contract documented
- [ ] Consent / privacy text written

---

## Resume guidance

When starting again:

1. Read this file.
2. Read [README.md](README.md) for the document index.
3. Start with [11-prisma-removal.md](11-prisma-removal.md) — it is the next task.
4. Then follow [01-task-list.md](01-task-list.md).
5. Treat [07-api-contract.md](07-api-contract.md) Part 1 as frozen. The Android
   app is live against it.

---

## Update log

### 2026-08-13 (later) — Prisma removed, client scaffolded

Milestone 1 and milestone 8 written in one pass. **None of it has been executed** —
`npm install` was not run (no internet by instruction), so no test, typecheck or
lint result exists for any of this. See [QUESTIONS.md](QUESTIONS.md).

**Server**

- `src/db/pool.ts` — the `pg` pool with `query` / `queryOne` / `execute` /
  `withTransaction`. Every connection pins `timezone=UTC`, and `int8` is parsed as
  a number so `participantId` stays a JSON number for the Android app.
- `src/db/types.ts` — the domain types Prisma used to generate.
- One `*.queries.ts` per module holds all the SQL. Rows come back `snake_case` and
  are mapped to `camelCase` there, so the frozen responses are unchanged.
- `saveLocationBatch` is a single `UNNEST` insert — one statement for up to 200
  points, identical SQL text whatever the batch size.
- `tests/support/fake-prisma.ts` → `tests/support/fake-db.ts`: an in-memory store
  that dispatches on the SQL text the query files actually send, so a broken
  statement fails there instead of passing quietly. Assertions were not changed.
- New `tests/events-tracking.test.ts` covers the three frozen transmitter
  endpoints, including that a delayed batch keeps its original `recordedAt`.
- `sql/` now owns the schema: `001-init` through `007-users-avatar`, plus
  `900-timestamptz-migration.sql` and a `README.md` saying which to run where.
- Location ingest is rate-limited per rider (`req.auth.userId`), not per IP.
- Added `GET /api/v1/users/me` — additive, for the web app's cold start.
- **`tsconfig.json` did not exist**, though `package.json` referenced it. Added,
  split into a typecheck config and a build config.
- `LOCATION_RETENTION_DAYS` added to the validated environment (default 30).

**Client**

- React 19 + TypeScript + Vite, PWA manifest and a small hand-written service
  worker (shell and tiles cached; the API deliberately never is).
- `lib/api-client.ts` is the only thing that talks to the server: bearer token,
  one in-flight refresh at a time, `X-Client-Action-Id`, and 409 treated as
  success for replayed offline actions.
- Design tokens carry both display modes and light/dark; `competition` only
  changes density and weight.
- Real screens: login (Google + SMS), profile setup, account, join by code or QR.
  Everything else is a placeholder naming its milestone and the endpoints it
  waits for.
- Leaflet is in its own chunk and only `LiveMapPage` may import it.
- Folder guides written: `client-podium/AGENT.md` and `server-podium/AGENT.md`.

### 2026-08-13 — Documentation review, and the server was found

Reviewed `PODIUM.docx` against all planning docs and both reference projects.
Roughly 25 issues found and fixed. The significant ones:

- **A working server already existed** and was added to `server-podium/`. The plan
  was rewritten around it instead of assuming a greenfield build.
- **The Android API is now documented** ([07-api-contract.md](07-api-contract.md)),
  read from the running code rather than designed on paper. It was previously the
  project's biggest unknown.
- **Every timestamp in the live database lacks a timezone.** Confirmed in the
  committed migration. Serious for delayed GPS uploads; migration written.
- **An SOS feature exists** in the app and database that appeared in no planning
  document. Now specified.
- The old `event_permissions` design could not express the actual requirement —
  a public event has an audience nobody can enumerate. Visibility moved onto the
  event itself.
- Participant status was one column doing three unrelated jobs. Split into
  registration / attendance / result.
- `event_participants.user_id` is `NOT NULL`, which makes manual and Excel-imported
  participants impossible. Must become nullable.
- `events` has no owner column at all.
- Retention contradicted the history requirement; resolved by separating raw
  points from saved tracks.
- Three event types collapsed to two kinds plus two styles.
- **Maps were never planned.** Decided: Leaflet + OpenStreetMap tiles, tile URL in
  config. Google Maps rejected — it needs a credit card, charges on overage, and
  forbids caching tiles. Live rider markers, SOS blinking and the tap-to-detail
  modal are drawn by us and are unaffected by the tile provider.
- Added: join code, Excel import, results, route library, consent, glossary,
  non-functional requirements, testing standard.

### Initial project setup

Planning folder created. Product overview, task list, database draft, and progress
file written.

---

## Working notes

The project should stay intentionally simple in this first stage. Build a stable
event workflow and tracking foundation before adding advanced race features.

The one rule that overrides convenience: **the Android app is live and must keep
working**. Anything that would require changing it is the wrong approach.
