# Server tasks — event results & Find Tracks

Handoff doc for a server-focused session, covering two client features built against mock
data this session, each documented in its own numbered part below:

- **Part A — event results** (route map + rider results, inline on `EventDetailPage.tsx`)
- **Part B — Find Tracks** (the route-planning tool at `/routes`)
- **Part C — Event create: activity type & copying a track** (`EventCreatePage.tsx`)

Nothing in either part has been built server-side yet; treat every item below as pending.

**This explicitly supersedes one existing decision.** `plan/03-progress.md`'s 2026-08-13
decision log says *"Race results — Basic only: finish time and finishing position. No laps,
waves, or category scoring."* Category-place computation (and the fields it needs) is now in
scope — confirmed directly by the product owner. Update that decision log entry when this work
starts, rather than leaving the old line standing unqualified.

Read `plan/02-database-schema.md` (participant three-axis status: registration / attendance /
result), `plan/07-api-contract.md` (existing participants endpoints), and
`plan/08-routes-and-maps.md` (route schema and map plan — already fully designed, just not
built) before starting. This doc does not repeat what's already specified there.

---

# Part A — Event results

## 1. Schema additions

Extends the `event_participants` table (`plan/02-database-schema.md` §"Basic results only"
block):

```sql
ALTER TABLE event_participants
  ADD COLUMN team VARCHAR(120),
  ADD COLUMN country_code CHAR(2);   -- ISO 3166-1 alpha-2, e.g. 'IL', 'FR', 'IT'
```

`category VARCHAR(80)` already exists ("races only") — reuse it, do not add a second field.

New tables for the split/segment case (an event whose route is divided into named parts, each
possibly a different discipline, e.g. an 80 km gravel leg + a 40 km MTB leg):

```sql
CREATE TABLE event_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id),
  name VARCHAR(120) NOT NULL,          -- "Stage 1 — Gravel"
  discipline VARCHAR(30) NOT NULL,     -- 'road' | 'gravel' | 'mtb'
  distance_km NUMERIC(6,2) NOT NULL,
  split_order INT NOT NULL
);

CREATE TABLE participant_split_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id BIGINT NOT NULL REFERENCES event_participants(id),
  split_id UUID NOT NULL REFERENCES event_splits(id),
  time_seconds INT,           -- null until this rider completes the split
  gap_seconds INT,            -- gap to the split's category leader
  place INT,                  -- overall place within the split
  category_place INT
);
```

An event with no splits simply has zero `event_splits` rows — the results endpoint (below)
returns an empty `splits` array per rider in that case, matching the mock shape exactly.

`users.avatar_url VARCHAR` — does not exist anywhere today. Populate it from the Google
sign-in payload's profile picture URL at account creation/update in `auth.service.ts`. Null
for anyone who signed in another way (SMS, dev shortcut) — never fabricate one.

## 2. Category-place computation

Rank finishers within each `category` value by `finish_position` (or `finished_at` where
position is tied/absent), separately per split when splits exist. This did not exist before —
build it as a query/service function, not a stored column that can drift; compute at read
time in the results endpoint below, the same way the rest of this codebase treats derived
values (see `event.service.ts`'s `isActiveForStatus`).

## 3. New endpoint

```
GET /api/v1/events/:eventId/results
```

- `optionalAuth`, same as `GET /events/:eventId` — a public event's results are readable by
  anyone, a private one 403s a non-owner, no different from the existing rule.
- Returns the exact shape drafted in `src/lib/mock-results.ts` (`RiderResult[]` plus the
  route's `EventRoute` with its `splits: RouteSplit[]`) — keep the client and server shapes
  identical so wiring the client to this endpoint later is a one-function swap in
  `src/store/resultsStore.ts` (replace `getEventResults` mock call with a real `apiRequest`),
  not a rewrite of the results page.
- Joins `event_participants` (+ the new `team`/`country_code` columns), `users.avatar_url`,
  `event_splits`, `participant_split_results`, and the route row via `event_routes` /
  `routes` (§4).

## 4. Route/map data

Already fully planned in `plan/08-routes-and-maps.md` — schema (`routes`, `event_routes`),
upload formats, `GET /routes/:id` for full geometry, `preview_points` for cards. Nothing new
here except: that file has no concept of splits *within* one route. `event_splits` (§1) is
additive to it, not a replacement — a route still has one geometry; splits are markers along
it (by distance or by point index, whichever is simpler to compute against the stored
`track_points`) telling the results endpoint where one split ends and the next begins.

## 5. Out of scope, still

Per the still-standing parts of the 2026-08-13 decisions: laps, waves. Splits are not
"laps" — a lap repeats the same course; a split is a single pass over a different, named
segment of one course. Do not conflate the two when building this.

---

# Part B — Find Tracks (route planner, `/routes`)

Client: `src/pages/TracksPage.tsx`, `src/store/tracksStore.ts`, `src/lib/mock-tracks.ts` (the
`Track`/`TrackDay`/`TrackHazard`/`TrackPOI` shapes and `getTracks(filters)` — the target shape
for everything below), `src/app/TrackMap.tsx`, `src/app/TrackCard.tsx`.

This is a bigger lift than Part A: it needs the already-planned route schema
(`08-routes-and-maps.md`) extended with fields that don't exist in *any* plan doc, plus **three
real external data integrations that have no chosen provider yet.**

## 1. Schema — extends `routes` (08-routes-and-maps.md)

```sql
ALTER TABLE routes
  ADD COLUMN surface_type VARCHAR(10),   -- 'road' | 'gravel' | 'mtb'
  ADD COLUMN country_code CHAR(2),
  ADD COLUMN state VARCHAR(120),
  ADD COLUMN area VARCHAR(120);

-- Multi-day trips: a route can span more than one day. One row per day when it does; a
-- single-day route has exactly one row here, day_number = 1 — matches mock-tracks.ts's
-- `days: TrackDay[]` exactly, never empty.
CREATE TABLE route_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES routes(id),
  day_number INT NOT NULL,
  distance_km NUMERIC(6,2) NOT NULL,
  climb_m INT NOT NULL,
  track_points JSONB NOT NULL   -- same shape as routes.track_points, scoped to this day
);
```

`favorite` — client-only in this pass (`tracksStore.ts`, in-memory, lost on reload). Real
persistence needs a `favorite_tracks(user_id, route_id)` join table — trivial, but not built.

## 2. Three external data integrations — no provider picked for any of these

Each of these is illustrative mock data in the client right now
(`mock-tracks.ts`'s `airQuality`/`hazards`/`pois` fields). None has a chosen real source. Each
is genuinely a separate decision (cost, rate limits, coverage for Israel/Europe where this
app's actual riders are) — don't bundle them into one ticket.

- **Air quality** (`Track.airQuality: { aqi, label }`) — needs a provider (e.g. a national
  air-quality API, or a commercial aggregator). Likely fetched server-side and cached per
  region/day, not called live per request.
- **Traffic hazards** (`TrackHazard[]`, per-`dayOfWeek`) — no obvious off-the-shelf source for
  "this road is busy on Fridays." Two real options: (a) a real traffic-data API if one covers
  the target regions, or (b) rider-reported hazards (a new table + a report-a-hazard client
  flow) — the latter is more in keeping with how this app already treats SOS/participant
  data (owned by the app, not a third party). Needs a product decision, not just an
  engineering one.
- **POIs** (`TrackPOI[]`: gas/toilet/motel/shop) — OSM's **Overpass API** is the obvious
  no-cost starting point, consistent with this project's OSM-first stance on map tiles
  (`08-routes-and-maps.md`). Query POIs within a buffer of the route's `track_points` at
  route-save time (like `distance_km`/`elevation_m` are already computed once, not on read),
  cache the results on the route row rather than querying Overpass per page view.

## 3. New endpoint

```
GET /api/v1/tracks
```

Query params mirror `TrackFilters` in `mock-tracks.ts`: `location` (matches name/country/
state/area), `surfaceType`, `minDistanceKm`/`maxDistanceKm`, `minClimbM`/`maxClimbM`,
`multiDayOnly`, `avoidBusyRoads` (excludes any route where `hasBusyRoads` is true — that flag
itself needs a definition once real hazard data exists; for now it's a simple boolean on the
route). Public, no auth required, same spirit as `GET /events/public`.

## 4. Explicitly not done here

- No deep wiring from a selected track into `EventCreatePage`'s form — "Plan a ride with this
  track" just opens `/events/new`. Real route-to-event attachment is the already-planned
  `event_routes` table (`08-routes-and-maps.md`) — attaching a chosen track/route to a new
  event is a follow-up, not part of this ticket.
- No raster map overlays (a real air-quality tile layer, for instance) — the client's "layers"
  toggle only shows/hides point markers (hazards, POIs), not tile overlays. Revisit if a
  provider is chosen that offers tile-based air-quality data.

---

# Part C — Event create: activity type & copying a track

Client: `src/pages/EventCreatePage.tsx`, `src/pages/EventCreatePage.module.css`. Two fields on
the create form that are shown to the organizer but go nowhere past the browser tab today,
both flagged inline in the component's own doc comment.

## 1. Activity type

A radio picker (Road/MTB/Gravel/Running/Hiking, same values as Find Tracks' `SurfaceType`).
`07-api-contract.md` Part 1 is frozen (the Android app is live against it) and has no field
for this, and `events` has no column for it either.

```sql
ALTER TABLE events ADD COLUMN activity_type VARCHAR(10); -- 'road'|'gravel'|'mtb'|'running'|'hiking'
```

Add to the `POST /events` (and edit) body once the column exists; trivial once Part B's
`surface_type` naming convention is settled, since it should match exactly.

## 1b. Level

Same story, same page, one more radio picker: Beginners/Intermediate/Masters/Elite/World Tour.
Not the same thing as ride groups (Part D §2's `event_groups` — a real split into multiple
concurrent groups with their own tracks) — this is one label for the whole event, "who this is
pitched at."

```sql
ALTER TABLE events ADD COLUMN level VARCHAR(20); -- 'beginner'|'intermediate'|'masters'|'elite'|'world_tour'
```

Nullable — "Not specified" is a real, valid choice on the form, not just a loading state.

## 2. Copy track from an existing event

The create form lets an organizer pick one of their own or another public event and preview
its route (name, distance, climb) as a starting point for the new event — but the picked
route is never attached to anything. It's read via `getEventResults()` (`lib/mock-results.ts`,
same mock Part A's results page uses), which is why every event already "has" something to
preview even though no route data is real yet.

Real support needs the already-designed `event_routes` join table
(`plan/08-routes-and-maps.md`) plus:

- `POST /events` (or a follow-up `PUT /events/:id/route`) accepting a source route/event id to
  copy geometry from, rather than only accepting a freshly uploaded route.
- A decision on copy semantics: does the new event get its own independent copy of the
  `track_points` (safe if the source route is later edited or deleted), or a shared reference
  to the same `routes` row? Independent copy is simpler and matches "duplicate this event's
  track," not "link to it live" — recommended, but confirm before building.

## 3. Explicitly not done here — uploading your own track

Raised directly by the product owner, deferred on purpose: an organizer uploading their own
track file (a GPX/TCX export from Garmin/Strava/Komoot, or raw points from a spreadsheet)
instead of only copying from an existing event. Bigger than either item above — needs a file
upload endpoint, a parser per format, and validation (point count limits, coordinate
sanity-checking) that doesn't exist anywhere in this codebase yet. Not started; needs its own
scoping pass before work begins.

---

# Part D — Participants, live tracking, and weather

## 1. Participants (start list, check-in, approvals)

Client: `src/pages/EventParticipantsPage.tsx`, `src/store/participantsStore.ts`,
`src/lib/mock-participants.ts`. Nothing new to design here — the full contract already exists
(`plan/07-api-contract.md`'s **Participants** section, `plan/02-database-schema.md`'s
`event_participants` table, including the three-axis `registration_status` /
`attendance_status` / `result_status` split) — none of it is built server-side yet. The client
is written against that exact shape so wiring `participantsStore.ts` to real `apiRequest` calls
later is a function-body swap, not a rewrite of the page.

One addition worth flagging: `POST .../participants/import` (Excel/CSV, races only) is shown
in the UI as a disabled "coming soon" button — raised directly, explicitly deferred, not
started. Needs a file parser and row-validation story of its own, similar in shape to the
track-upload item in Part C §3 but for participant rows, not geometry.

**Self-registration + reminders (described directly, not built anywhere yet):** for a public
event, a rider applies through the real app (once `POST /events/join` or an equivalent
self-serve path lands a row with `registration_status = 'waiting_approval'`), the organizer
approves/rejects on `EventParticipantsPage.tsx` (client already built for this — see above),
and **the server sends the rider a reminder — email, or possibly SMS — as the event
approaches.** That last part is pure server work: a scheduled job plus an email/SMS provider,
neither of which exists anywhere in this codebase. No provider chosen; needs its own scoping
pass (cost, deliverability, which events/riders qualify, how far ahead) before work starts.

`EventCreatePage.tsx` now has a "Require my approval before a rider who joins is confirmed"
checkbox (public events only) that previews exactly this — but it's client-only storage
(`store/eventExtrasStore.ts`) today, nothing enforces it. Real support needs: (a) an
`events.requires_approval BOOLEAN DEFAULT FALSE` column, and (b) `POST /events/join` checking
it and setting `registration_status = 'waiting_approval'` instead of the current default
`'registered'` when true.

## 2. Ride groups (Elite/Masters etc.)

Client: `src/pages/EventGroupsPage.tsx`, `src/store/eventGroupsStore.ts`. A club/team riding
one event as 2-4 separate groups at once, each with its own start time and optionally its own
track — **genuinely new territory**, unlike Participants above: there is no `groups` concept
anywhere in `02-database-schema.md` or `07-api-contract.md`, not even an unbuilt one. Entirely
client-only for now, persisted to localStorage, keyed by event id.

Real support needs, at minimum:

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

Not about placing or ranking between groups — confirmed directly ("it not about place just to
see 2 3 or 4 groups") — so no group-vs-group scoring belongs anywhere in this design. Started/
Finished per rider reuse the *existing* `attendance_status`/`result_status` axes (`'started'`/
`'finished'`) — no new participant columns needed for that part, only `group_id`.

## 3. Live tracking placeholder

Client: `src/app/LiveTracking.tsx` (+ `LiveRidersMap.tsx` for the map itself, lazy-loaded).
Calls the real `GET /events/:eventId/live` (already specced, "Part 2 — TO BUILD" in
`07-api-contract.md`) and shows an honest "waiting for real GPS" placeholder for anything
other than a non-empty success response — **direct decision, confirmed rather than assumed**:
no simulated/fake rider positions, unlike the mock data used elsewhere in this app. A live map
with fabricated dots would misrepresent GPS tracking as already working, which conflicts with
the standing rule against fabricating anything that reads as a live/safety signal (see
`TrackCard.tsx`/`TrackMap.tsx`'s hazard doc comments for the same principle). Real tracking
needs the Android app transmitting into `participant_last_location` — see `RouteMap.tsx`'s own
doc comment ("milestone 6, unbuilt"). Nothing to build here beyond what §"Live tracking" in
`07-api-contract.md` already specs; this is a pointer, not a new design.

## 4. Weather

Client: `src/lib/weather.ts`, called from `EventDetailPage.tsx`. This one's real today, not
mocked — [Open-Meteo](https://open-meteo.com) directly from the browser, free, no API key, no
proxy. The gap: there is nowhere in the schema that stores an event's coordinates (`Location`
is free text, e.g. "Galilee, Israel," never geocoded) — the client currently uses the mock
route's first point as a stand-in for "roughly where this event is." Real support needs either
(a) geocoding `Location` server-side at create/edit time (a new external dependency, provider
not chosen), or (b) capturing real lat/lon once routes are actually attached to events
(`event_routes`, Part C §2) — the latter is more consistent with this app's existing
"illustrative until a route is real" pattern and is probably the one to build first.

Same gap, same stand-in point: `src/lib/nav-links.ts`'s "Drive there" Waze/Google Maps links on
`EventDetailPage.tsx`. No server work needed either way (both are plain URL schemes), but
they'll get more accurate the moment real coordinates exist.

Covers past events too now: past dates go to Open-Meteo's **archive** API (historical actuals,
same free/no-key deal as the forecast one) instead of returning nothing — asked for directly
("for past event and future").

## 5. Air quality & traffic badges — mock, no provider chosen

Client: `src/lib/air-quality.ts`, `src/lib/traffic.ts`, both called from `EventDetailPage.tsx`.
Unlike weather (§4, real today), these two are illustrative mock data only, same pattern as
Find Tracks' `Track.airQuality`/`TrackHazard` — asked for directly, mock accepted explicitly
("take from some google or from my server ... i will se nuw mock it"). Deterministic by event
id + date, not random, so a reload doesn't reshuffle the badge.

Real support needs a provider decision for each, genuinely separate tickets:

- **Air quality** — a Google Air Quality API call (or a national source, same open question
  already logged for Find Tracks in Part B §2), keyed off the same coordinates weather uses
  once those are real.
- **Traffic** — Google Maps' traffic layer/API is the obvious fit given the app already asked
  for Waze/Google Maps nav links (§4 above); no rider-reported alternative makes sense here the
  way it did for Find Tracks' hazards (traffic changes hour to hour, not something worth
  crowdsourcing per-road).

Badge colour convention worth keeping if this becomes real: green good/clear, amber moderate,
red bad — set directly ("short but gren ok red bad").

---

# Part E — Proposed: event code format change

Requested directly: switch the event join code from the current `DDMMYYYY` + letter suffix
(e.g. `13082026A`) to 3 capital letters + 3 digits (e.g. `ABC-123`).

**Not a client change.** `07-api-contract.md` documents the current format as part of the
**frozen** Part 1 contract, generated in `server-podium/src/modules/events/event-code.ts`, with
the Android transmitter already live against it. This needs, at minimum:

1. Sign-off that this is an intentional break from "Part 1 is frozen," not an oversight.
2. A new generator (`event-code.ts`) producing the new format, with a collision-avoidance
   strategy — the old format's date prefix made collisions structurally rare (one event per
   day needs a letter bump); a fully arbitrary 3-letter/3-digit space needs its own uniqueness
   check against `events.code`.
3. A decision on the existing rows: reformat on a migration, or grandfather old-format codes
   in (both formats valid for lookup going forward)?
4. An Android app update, coordinated — the app is "already live against" the old format per
   the contract doc, so a server-only change breaks it silently otherwise.

Client changes are cosmetic only until the above lands: `JoinPage.tsx`'s code-entry placeholder
now shows `"ABC-123"` as a preview, and the mock ride codes in `lib/mock-my-rides.ts` were
reformatted to match — neither validates or enforces the new format.
