# Server integration plan — connecting podium-client to the real podium-server

Handoff doc for the server-side agent. The goal: wire this PWA (`podium-client`) to the real
backend (`podium-server`, sibling repo — already running locally per `03-progress.md`'s
2026-08-14 entry, 70/70 tests passing at that point) step by step, starting with read-only
public data and working up to the heavier features. Every endpoint below is listed with the
exact shape the client already expects — most of this client code is *already written* against
these shapes (mock data standing in where no endpoint exists yet), so in most cases the server
work is "build this to match," not "design this from scratch."

**Read first:** `plan/07-api-contract.md` (the authoritative contract — Part 1 frozen, Part 2
to-build), `plan/02-database-schema.md` (table shapes), `plan/server-tasks.md` (accumulated
"what real support needs" notes from this session, Parts A–E). This doc is an integration
*order* and a *cross-check* against what the client actually calls today — it does not replace
those three, and where it repeats them it's summarizing, not redefining.

**Status caveat:** the "built" / "not built" calls below come from `plan/03-progress.md`'s
2026-08-14 snapshot, not a live check — no server was running during the session that produced
this doc. Verify current state (`npm test` in podium-server, or just try each endpoint) before
trusting any "✅ built" label here.

---

## How the client talks to the server (read this before building anything)

From `src/lib/api-client.ts`:

- Every request goes through `apiRequest<T>(path, options)`, which auto-unwraps a
  `{ "data": T }` envelope — if the server returns `{ data: {...} }`, the client sees just the
  inner object. Frozen Part 1 endpoints return bare objects (no envelope) and pass through
  unchanged either way, since the unwrap only triggers when `"data"` is a top-level key.
- `apiMutate` (used for a subset of mutations, not all of them yet) sends a
  `X-Client-Action-Id: <uuid>` header and treats a `409` response as success, returning the
  original result — the offline-dedup contract. **None of the endpoints the client currently
  calls (below) use `apiMutate` yet** — they all use plain `apiRequest`. That's a gap worth
  closing as each mutation gets wired for real, not a reason to skip the dedup header when
  building the server side.
- 401 triggers one silent token-refresh attempt, then re-login if that fails too. 403 is shown
  to the rider as "not permitted." Both must be real, distinct status codes — see
  `07-api-contract.md`'s "we deliberately do not follow" the always-200 rule.
- Base URL: `VITE_API_URL`, `http://localhost:6500/api/v1` locally per `.env`.

---

## Phase 0 — Confirm what's actually live

Before starting Phase 1, confirm against the running server:

1. `GET /health` → `{ "status": "ok" }`.
2. `GET /events/public` returns the two seeded events from `sql/seed.sql` (per progress notes).
3. `npm test` in `podium-server` is green.

If any of these fail, fix them before proceeding — everything below assumes a working baseline.

---

## Phase 1 — Public & past events (read-only, no auth)

Matches the user's own requested starting point: "start with the passed events."

```
GET /api/v1/events/public
GET /api/v1/events/:eventId
GET /api/v1/events/by-code/:code
```

**`GET /events/public`** — anonymous. Response: `EventSummary[]`:

```ts
{
  id: string; code: string; name: string;
  type: "RIDE" | "RACE";
  status: "draft"|"published"|"registration_open"|"ready"|"live"|"finished"|"cancelled";
  visibility: "public" | "private";
  displayMode: "standard" | "competition";
  startsAt: string | null; endsAt: string | null;
  location: string | null; ownerId: number | null;
}
```
Called from `src/store/eventsStore.ts:105` (`loadOtherRides`). Client caches this in IndexedDB
(`lib/local-db.ts`) and paints the cache first, refreshes in the background — server response
just needs to be correct, no special offline handling needed server-side.

**`GET /events/:eventId`** — `optionalAuth` (works signed out for a public event, 403 for a
private one the caller doesn't own). Response: `EventDetail` — `EventSummary` plus:

```ts
{ requiresBib: boolean; description: string | null; finishedAt: string | null; isOwner: boolean }
```

Called from `EventDetailPage.tsx:184`, `EventGroupsPage.tsx:120`, `EventParticipantsPage.tsx:116`
(the latter two only read `{id, name, type, isOwner}` off the response — safe to return the
full shape, they just ignore the rest). **`isOwner` is derived server-side from the caller's
identity vs `owner_id` — do not make the client compute this.**

**`GET /events/by-code/:code`** — anonymous, used by `JoinPage.tsx:59` before sign-in.
Response: `{ eventId, name, type, requiresBib }`. 404 if no active event matches. This one is
listed as **frozen** in `07-api-contract.md` — do not change its shape.

**Nothing for "past" needs a different endpoint** — a finished event is just `GET
/events/:eventId` with `status: "finished"`. The client already renders results/route for any
status once results exist (Phase 6).

---

## Phase 2 — Auth (verify, likely already built)

Per progress notes, this is done: Google sign-in, SMS, dev-login, refresh, logout, `/users/me`.
Confirm each of these against `src/auth/AuthContext.tsx` before moving on — the client's own
call sites (with line numbers) so you can cross-check request/response shape fast:

```
GET  /api/v1/auth/config                        AuthContext.tsx / LoginPage.tsx:54
POST /api/v1/auth/sms/request      {phone}       LoginPage.tsx:101
POST /api/v1/auth/google           {idToken}     AuthContext.tsx:125
POST /api/v1/auth/sms/verify       {challengeId,code}   AuthContext.tsx:137
POST /api/v1/auth/dev-login        {role,key}    AuthContext.tsx:152   (dev-only, delete before prod)
GET  /api/v1/users/me                            AuthContext.tsx:76
PATCH /api/v1/users/me             Partial<Profile>     AuthContext.tsx:186
POST /api/v1/auth/logout                         AuthContext.tsx:196  (best-effort, errors swallowed)
```

`Profile`: `{ id, role: "RIDER"|"COMMISSAIRE", firstName, lastName, nickname, emergencyPhone,
requiresProfile }`. `requiresProfile` is true until firstName/lastName/nickname are all set —
`emergencyPhone` optional.

---

## Phase 3 — Join / register

```
POST /api/v1/events/join    { eventCode, bib? }
```

Frozen shape (`07-api-contract.md`): response `{ eventId, participantId, eventName, eventType,
requiresBib }`. **Idempotent by upsert** — re-joining the same event returns the existing
`participantId`, never an error; also clears `left_at`. 400 if the event requires a bib and
none was given, 404 if the code matches nothing active. Called from `JoinPage.tsx:87`.

`participantId` is `event_participants.id` — the identifier the Android GPS pipeline hangs on.
Do not change its meaning or type.

---

## Phase 4 — "My" events

```
GET /api/v1/events?filter=mine
GET /api/v1/events?filter=joined
```

Both return `EventSummary[]` (same shape as Phase 1). Called together via `Promise.all` in
`eventsStore.ts:71-72`, merged client-side (deduped by id) into "My Rides." Requires auth.

---

## Phase 5 — Create / edit / status transitions

```
POST   /api/v1/events                          EventCreatePage.tsx:124
PATCH  /api/v1/events/:eventId                  EventDetailPage.tsx:229
DELETE /api/v1/events/:eventId                  EventDetailPage.tsx:265
```

**`POST /events`** body:
```ts
{
  name: string;
  type: "RIDE";            // client always sends "RIDE" now — see note below
  requiresBib: false;      // client always sends false now
  displayMode: "standard"; // client always sends "standard" now
  visibility: "public" | "private";
  startsAt?: string;       // ISO
  location?: string;
  description?: string;
}
```
Response: `{ id: string }`.

> **Client-side note, not a server bug:** this session hid the Kind (Ride/Race)/bib/
> display-mode UI on `EventCreatePage.tsx` — direct product decision, "this app will start
> rides later we convert or add races." The client still sends all three fields (Part 1 is
> frozen, they're required), just always the same fixed values. The server does **not** need
> to reject or special-case `RACE` — just know that no `RACE` event will originate from this
> client until that UI comes back.

**`PATCH /events/:eventId`** body `{ name, location?, description? }` → full `EventDetail`.

**`DELETE /events/:eventId`** → full `EventDetail` (client reads the response body, expects
the updated object back, not a bare `204`). Per the client's own doc comment this is a **soft
delete** — sets `status: "cancelled"`, does not remove the row.

### ⚠ Needs reconciling: status transitions

The client calls:
```
PATCH /api/v1/events/:eventId/status   { status }   →  EventDetail
```
(`EventDetailPage.tsx:247`, `changeStatus()`, used for every step in the `NEXT_STATUS` chain:
draft→published→registration_open→ready→live→finished.)

But `07-api-contract.md` Part 2 specs **separate** transition endpoints instead:
```
POST /api/v1/events/:eventId/publish
POST /api/v1/events/:eventId/start
POST /api/v1/events/:eventId/finish
```

These two don't match. Pick one and make the other side agree — recommended: **build the
generic `PATCH .../status`** the client already calls (simpler, one code path for a 5-state
chain) and treat the contract doc's three-endpoint version as superseded; update
`07-api-contract.md` to reflect the decision either way so it doesn't drift from what's real.

---

## Phase 6 — Event results (route + riders)

Not called by the client yet — `src/store/resultsStore.ts` currently calls
`lib/mock-results.ts` directly. This is the next real swap once built.

```
GET /api/v1/events/:eventId/results
```

`optionalAuth`, same visibility rule as `GET /events/:eventId`. Response must match
`src/lib/mock-results.ts`'s `EventResults` shape **exactly** (route + riders + organizer) so
the swap in `resultsStore.ts` is a one-function change, not a page rewrite:

```ts
interface EventResults {
  organizer: { name: string; phone: string | null; countryCode: string };
  route: { points: [number, number][]; distanceKm: number; elevationM: number | null; splits: RouteSplit[] };
  riders: RiderResult[];  // see mock-results.ts for the full per-rider shape
}
```

Schema additions needed (`plan/02-database-schema.md` / `server-tasks.md` Part A): `team`,
`country_code` on `event_participants`; new `event_splits` / `participant_split_results`
tables for the (optional) multi-segment case; category-place computed at read time, not stored.

> **Client-side note:** `RiderResultRow.tsx` no longer *displays* DNF status, category, finish
> time/place, or splits (rides-only decision, same session) — but the data fields still exist
> in the type and should still be returned if present. Don't drop them from the response just
> because the current UI doesn't render them; a future screen (or a re-enabled race mode) will.

---

## Phase 7 — Participants (start list, check-in, approvals)

Fully built client-side against mock data (`EventParticipantsPage.tsx`,
`store/participantsStore.ts`, `lib/mock-participants.ts`) — **nothing new to design**, the
full contract already exists:

```
GET    /api/v1/events/:eventId/participants
POST   /api/v1/events/:eventId/participants          manual add       (owner/operator)
POST   /api/v1/events/:eventId/participants/import   Excel/CSV import (owner/operator)  — see note
PATCH  /api/v1/events/:eventId/participants/:id      edit / status    (owner/operator)
DELETE /api/v1/events/:eventId/participants/:id                       (owner/operator)
POST   /api/v1/events/:eventId/participants/:id/approve               (owner)
POST   /api/v1/events/:eventId/participants/:id/reject                (owner)
```

Participant shape (`event_participants` + additions from Phase 6, plus the check-in fields):

```ts
{
  id, eventId, userId: number | null, name, bib: string | null,
  email: string | null, phone: string | null, category: string | null,
  registrationStatus: "registered"|"waiting_approval"|"approved"|"rejected",
  attendanceStatus: "unknown"|"present"|"dns"|"started",
  resultStatus: "none"|"finished"|"dnf"|"stopped"|"unknown",
  joinedAt: string,
}
```

Status changes set exactly one of the three axes — never merge them into one field (see
`02-database-schema.md`'s explicit warning about this, repeated from an earlier project's
post-mortem).

**Import (Excel/CSV) is explicitly deferred** — the client shows a disabled "coming soon"
button for it. Don't prioritize this endpoint; needs a file parser and row-validation design of
its own first.

**Not yet a client field, but referenced in this session's asks — `group_id`:** see Phase 10.

---

## Phase 8 — Live tracking

```
GET /api/v1/events/:eventId/live
```

Client (`src/app/LiveTracking.tsx:47`) calls this today and expects nothing back (no server
support = empty/failed response = an honest "waiting for GPS" placeholder is shown, **on
purpose, not a bug** — direct decision: no fake rider positions). Expected shape:

```ts
{ participantId: number; name: string; bib: string | null; lat: number; lng: number;
  recordedAt: string; emergency: boolean; distanceKm: number }[]
```

**⚠ Check this against `07-api-contract.md`'s own `GET /live` spec** — the contract says this
reads only `participant_last_location` and returns position/`recorded_at`/`emergency`/distance
— it does **not** mention `name`/`bib`. The client needs those too (to label a rider on the
map), which means either (a) join `event_participants` in this endpoint's query, or (b) the
client does a second lookup against the already-fetched participants list and matches by
`participantId`. (b) is less server work and the data's already on the page — recommended.

This requires `POST /events/:eventId/locations/batch` (Android ingest — **frozen**, per
progress notes already built) to actually be writing `participant_last_location`, which is
Milestone 6 territory per the task list and, per that same list, **not built yet**. Low
priority relative to Phases 1-7; the client degrades gracefully without it.

---

## Phase 9 — Routes / Find Tracks

Biggest remaining lift, and the one with genuinely open product decisions (three unpicked
external data providers) — see `plan/server-tasks.md` Part B in full before starting. Summary:

```
POST   /api/v1/routes
GET    /api/v1/routes
GET    /api/v1/routes/public     ?place=&minDistance=&maxDistance=&minElevation=&maxElevation=&type=&page=&pageSize=
GET    /api/v1/routes/:id
PATCH  /api/v1/routes/:id
DELETE /api/v1/routes/:id
POST   /api/v1/events/:eventId/route     attach a route to an event (owner)
GET    /api/v1/tracks                    mirrors TrackFilters in mock-tracks.ts
```

Schema: extends `routes` (already designed in `08-routes-and-maps.md`) with `surface_type`,
`country_code`, `state`, `area`; new `route_days` for multi-day tracks. Three external
integrations, no provider chosen for any: air quality, traffic hazards (rider-reported is the
recommended approach, not a third-party feed), POIs (OSM Overpass API suggested, no-cost,
consistent with this app's OSM tile usage). **Do not start this phase without a product
decision on those three** — they're flagged open, not oversights.

Not in scope for this phase: track-upload from a file (GPX/TCX/spreadsheet) — separate,
unscoped, deferred on purpose (`server-tasks.md` Part C §3).

---

## Phase 10 — Ride groups (genuinely new — not in any contract doc yet)

Unlike everything above, this has **zero prior design** anywhere in `plan/` before this
session. Client: `EventGroupsPage.tsx`, `store/eventGroupsStore.ts`, currently pure
client-side/localStorage. Minimum real schema:

```sql
CREATE TABLE event_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id),
  name VARCHAR(120) NOT NULL,
  starts_at TIMESTAMPTZ,
  route_id UUID REFERENCES routes(id)   -- null = uses the event's own route
);
ALTER TABLE event_participants ADD COLUMN group_id UUID REFERENCES event_groups(id);
```

No endpoint list written yet — follow the same CRUD shape as `event_members`/`participants`
once this is prioritized (not urgent relative to Phases 1-8). Not about ranking or placing
between groups — confirmed directly, keep any design free of group-vs-group scoring.

---

## Deliberately out of scope for server work right now

- **Weather, air quality badge, traffic badge** on `EventDetailPage.tsx` — weather is real
  today via Open-Meteo, called directly from the browser (`lib/weather.ts`), no server
  involvement at all. Air quality/traffic are mock, explicitly accepted as mock ("i will se nuw
  mock it") — see `server-tasks.md` Part D §5 if a real provider gets picked later.
- **Event code format change** (`ABC-123` instead of `DDMMYYYY`+letter) — proposed, not
  approved; breaks the frozen Part 1 contract and the live Android app. See
  `server-tasks.md` Part E before touching `event-code.ts`. Client only changed a cosmetic
  placeholder, nothing that requires server action.
- **Self-registration reminders (email/SMS)** — real server work (scheduler + provider), no
  provider chosen, needs its own scoping pass. Not blocking Phases 1-8.
- **`activity_type` column** on `events` — small, low-urgency; client already has UI for it
  (client-only today), can land whenever convenient, doesn't block anything else here.
