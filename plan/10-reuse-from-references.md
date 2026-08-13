# What to Reuse from the Reference Projects

`examples/` is **read-only**. Copy from it; never edit it.

The brief says to use the previous Commissaire app and the supplied Node servers
as references. This is the concrete list — what to take, where it is, and what to
leave behind.

---

# From `examples/old-commissire`

A previous cycling-event app: React + Vite + TypeScript, IndexedDB, Zustand.
Local-only, no backend. Its UX and several utilities transfer directly.

## Copy this code

### Route file parsing — `src/app/utils/parseTrack.ts`

`parseTrackFile(fileName, text)` → `{ points, markers }`.

Handles **GPX** (`trkpt`, `rtept`, `wpt`), **TCX** (Garmin
`Trackpoint/Position`), **plain JSON** coordinate arrays and `{lat,lng}` /
`{latitude,longitude}` objects, and **GeoJSON** (LineString, MultiLineString,
Point). Validates coordinate ranges, flips GeoJSON `[lng,lat]` to `[lat,lng]`,
throws clear errors on unreadable files.

This covers every upload format Bike Podium needs. `centerOfPoints()` comes with
it. **Do not rewrite this.**

### The map — `src/app/components/map/RaceMap.tsx`

Leaflet + OpenStreetMap, no API key. Provides polyline rendering, automatic
start/finish circles, typed markers, `fitBounds`, a `bare` mode for preview cards,
`onViewChange` for capturing the map area, and — importantly —
**`editable` + `onMapClick`, which is the in-app route builder.**

Take the component and its CSS module. Keep the lazy-load discipline.

### Excel / CSV import — `src/app/components/csv/` + `services/csvMapper.ts`

Four-step wizard: upload → column mapping → preview → import. Includes automatic
column detection with a keyword dictionary, Hebrew and English support, saved
mapping templates, and `.xlsx` handling via a dynamic `xlsx` import.

Bike Podium needs Excel import for start lists. This is most of it.

Related files: `types/csv.types.ts` (field keys, ambiguous-alias caps),
`utils/fieldMappingDictionary.json`, `public/data/dictionary_*.json`.

### Consent — `src/app/legal/terms.ts`, `legal/termsAcceptance.ts`

Versioned acceptance in localStorage: `hasAcceptedCurrentTerms()`,
`acceptCurrentTerms()`, bump `TERMS_VERSION` to re-prompt everyone. Copy the
mechanism; write new text for Bike Podium (location consent, not race terms).

## Copy these ideas

### Status modelling — `docs/app-rules.md` §0

Commissaire deliberately keeps `raceStatus` (where the rider is in the run) apart
from `status` (result and eligibility). It learned that one status column cannot
express two independent facts.

Bike Podium takes the same lesson further: **three** axes — registration,
attendance, result. See [02-database-schema.md](02-database-schema.md).

### Offline sync — `docs/cloud/1-overview.md`, `docs/cloud/6-database.md`

Client-generated event ids for de-duplication, an append-only log, and
first-accepted-wins conflict resolution via a partial unique index. This is where
the `X-Client-Action-Id` + 409 design comes from.

### A rules catalog — `docs/app-rules.md`

Every behaviour gets a stable ID (`RULE-STA-01`) used directly as the test name.
Adopted as the testing standard — see
[09-nfr-privacy-testing.md](09-nfr-privacy-testing.md).

### Per-folder AGENT.md files

Commissaire puts a short guide in each significant folder: what it does, read
order, conventions, when to update. It makes the codebase navigable without
reading all of it. Adopted in
[06-development-standards.md](06-development-standards.md).

## Do not copy

- **IndexedDB as the source of truth.** Commissaire is local-first with no
  backend. Bike Podium has a server; the database is the truth and the client
  caches.
- **The Supabase cloud layer.** Bike Podium has its own server and auth.
- **The legacy RBAC experiment** — `types/rbac.types.ts`, `stores/authStore.ts`,
  `stores/rbacStore.ts`, `services/Auth.ts`. Commissaire's own docs mark these as
  a superseded experiment.
- **Laps, waves, heats and category scoring.** Out of scope: v1 results are finish
  time and position only.
- **Known open bugs** — check `BUGS.md` before copying anything near
  `calculatePosition.ts` (mutates its input) or the IndexedDB version handler
  (deletes all data on `VersionError`).

---

# From `examples/old-example servers`

Two Node/TypeScript BFF servers from a warehouse system. The domain is
irrelevant; the conventions are the point.

## Adopt these conventions

All are **already present** in `server-podium` — this is confirmation, not new
work:

- a zod schema per endpoint, in a `*.schemas.ts` beside the route
- `helmet`, CORS allowlist, rate limiting
- request logging with a request id
- one central error-handling middleware
- **no SQL in controllers** — it lives in a dedicated data layer
- validated, fail-fast environment configuration
- a consistent response shape

The "no SQL in controllers" rule matters most during the Prisma removal: SQL goes
in `<module>.queries.ts`, never in a controller or route handler.

## Deliberately reject this one

`server a/CLAUDE.md` states:

> never generate responses with a code other than 200
> the only exception is in catch block, keep up returning the code 500 from it

**Bike Podium does not follow this.** That rule exists because of a legacy client.
Our PWA must distinguish:

- **401** → token expired, re-login
- **403** → valid token, not permitted
- **409** → this offline action was already applied, treat as success

The offline sync design depends on 409. Collapsing everything to 200 makes these
indistinguishable and breaks replay.

This is recorded so nobody "restores consistency" with the reference server later.
Also skip the Oracle specifics, the BFF-to-internal-service split, and the
`INTERNAL_API_KEY` pattern — Bike Podium is a single public API.

---

# Quick lookup

| Need | Take from |
|---|---|
| Parse GPX / TCX / JSON / GeoJSON | `old-commissire/src/app/utils/parseTrack.ts` |
| Map, polyline, markers, draw mode | `old-commissire/src/app/components/map/RaceMap.tsx` |
| Excel / CSV import wizard | `old-commissire/src/app/components/csv/`, `services/csvMapper.ts` |
| Consent versioning | `old-commissire/src/app/legal/` |
| Why status is three fields | `old-commissire/docs/app-rules.md` §0 |
| Offline de-duplication design | `old-commissire/docs/cloud/1-overview.md` |
| Rules-as-tests pattern | `old-commissire/docs/app-rules.md` |
| Server middleware conventions | `old-example servers/server a`, `server b` |
| Bundle discipline (lazy Leaflet) | `old-commissire/CLAUDE.md` |
