# Routes, Tracks and Maps

A **route** is a planned course. It is stored independently of any event, so one
route serves many events and can be shared with other users.

Schema: `routes` and `event_routes` in [02-database-schema.md](02-database-schema.md).

---

## The four ways to create a route

### 1. Upload a Garmin-standard file

GPX and TCX — what a Garmin, Wahoo or Strava export produces.

### 2. Upload points

JSON, GeoJSON, or a simple list of points — start, middle, end.

### 3. Draw it on the map

Tap the map to place points; the route is built from them. Good for a club ride
nobody has recorded yet.

### 4. Reuse an existing route

Either the user's own, or another user's published route.

**Formats 1 and 2 are already solved.**
`examples/old-commissire/src/app/utils/parseTrack.ts` has `parseTrackFile()`,
which handles GPX (`trkpt`, `rtept`, `wpt`), TCX (Garmin `Trackpoint/Position`),
plain JSON coordinate arrays, and GeoJSON (LineString, MultiLineString, Point),
returning `{ points, markers }`. It validates coordinate ranges and flips GeoJSON's
`[lng, lat]` to `[lat, lng]`. **Copy it; do not rewrite it.**

---

## What is computed at upload

Once, when the route is saved — never on read:

| Field | How |
|---|---|
| `track_points` | full geometry from the parser |
| `markers` | named waypoints from the file |
| `preview_points` | simplified line for cards and previews |
| `point_count` | number of points |
| `distance_km` | sum of distances between consecutive points |
| `elevation_m` | total climb, when the file carries elevation |
| `start_lat/lon`, `end_lat/lon` | first and last point |
| `bbox_*` | min/max of all points |

`preview_points` is what makes the route browser fast: many map previews on one
screen must never load full geometry. Simplify with Douglas–Peucker, targeting a
few hundred points.

---

## The route browser

The requirement, in the product owner's words: *not only a list to scroll* — the
user pages through and **sees the map**, the way Strava's route library works, so
a known route can be recognised visually and reused in one tap.

### Layout

```
┌──────────────────────────────────────────────┐
│  [ Search ]  [ Distance ] [ Climb ] [ Type ] │
├────────────────┬────────────────┬────────────┤
│  ┌──────────┐  │  ┌──────────┐  │  ┌───────┐ │
│  │   map    │  │  │   map    │  │  │  map  │ │
│  │ preview  │  │  │ preview  │  │  │       │ │
│  └──────────┘  │  └──────────┘  │  └───────┘ │
│  Galilee Loop  │  Ashkelon Flat │  ...        │
│  62 km · 940 m │  40 km · 120 m │             │
│  by Dani       │  by Yael       │             │
├────────────────┴────────────────┴────────────┤
│              ‹ 1  2  3  4 ›                   │
└──────────────────────────────────────────────┘
```

Each card shows: **map preview, name, place, distance, elevation, owner.**
Tap a card → full-screen map, full geometry, and **Use this route**.

### Two tabs

- **My routes** — everything the user owns, public or not
- **Public routes** — routes other users published

### Filters

`place`, `minDistance`, `maxDistance`, `minElevation`, `maxElevation`, `type`,
plus paging. Endpoint:
`GET /api/v1/routes/public` — see [07-api-contract.md](07-api-contract.md).

The list endpoint returns **`preview_points` only**. Full geometry comes from
`GET /routes/:id` when a card is opened.

### Publishing

Routes are **private by default**. The owner publishes with `is_public = true`;
only published routes appear in the public tab. Unpublishing hides a route from
the library but does not affect events already using it.

---

## The map component

Reuse `examples/old-commissire/src/app/components/map/RaceMap.tsx`. It already
provides everything needed:

| Capability | How |
|---|---|
| Draw a route | `trackPoints: [lat, lng][]` → blue polyline |
| Start / finish | automatic green and red circles at the ends |
| Named waypoints | `markers: TrackMarker[]`, colour by type |
| Fit the view | `fitBounds` when no explicit centre is given |
| **Draw mode** | `editable` + `onMapClick(lat, lng)` — **this is the in-app builder** |
| Capture the area | `onViewChange(center, zoom)` |
| Preview card mode | `bare` — fills its container with no card chrome |

---

## Map tiles — the part that can cost money

**The library and the pictures are separate concerns.**

- **Leaflet** draws the map. It is an open-source library — free forever, no
  account, no key, no limits.
- **Tiles** are the map images Leaflet displays. This is the only part that can
  cost anything.

So the decision is not "which map library" — it is "which tile source".

### Decision: Leaflet + OpenStreetMap, with the tile URL in config

```ts
// one config value, one line to change later
const TILE_URL = import.meta.env.VITE_TILE_URL
  ?? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
```

Start on OSM's public tiles: no API key, no account, no credit card. Already
working in `RaceMap.tsx`.

**The catch, stated honestly:** the public OSM tile server is intended for modest
traffic. A thousand riders panning a live map can exceed what its usage policy
allows, and heavy users get blocked. Attribution is also required.

That is why the URL is a config value — moving to a keyed provider is a one-line
change, not a rewrite.

### Free tile providers, if OSM's limits become a problem

All have free tiers that need **no credit card**:

| Provider | Free tier | Notes |
|---|---|---|
| OpenStreetMap direct | hobby-use policy | current default; no signup |
| Stadia Maps | ~200k tiles/month | no card for the free tier |
| MapTiler | ~100k tiles/month | vector and raster |
| **Thunderforest** | ~150k tiles/month | **OpenCycleMap — shows cycle routes** |
| CyclOSM | free OSM style | **cycling-focused, shows bike paths** |

For a cycling product, **CyclOSM or OpenCycleMap are better than a generic road
map** — they render cycle paths, surface types and gradients that matter to
riders. Worth evaluating once the basics work.

### Why not Google Maps

Best-looking tiles, but:

- requires a **billing account with a credit card**, even inside the free credit
- overage is charged, so traffic spikes cost real money
- terms restrict caching tiles, which conflicts with offline use
- an API key must be secured and rotated

Commissaire contains a Google Static Maps helper
(`old-commissire/src/app/utils/mapServerUtil.ts`) that needs a key. **Do not carry
it over** — it adds a paid dependency for no gain here.

### Offline

Tiles are not cached for offline use in v1. Offline means the app keeps working —
event data, participant list, queued actions — with the map area blank until the
network returns. Pre-caching tiles for a route corridor is a possible later
feature, and is another reason to avoid providers whose terms forbid caching.

### Rules

- **Leaflet must stay lazy-loaded** — `lazy(() => import(...))`. Commissaire
  records that importing it eagerly took the bundle from 65 kB to 559 kB.
- Leaflet mis-measures inside flex and tab containers; call `invalidateSize()`
  after mount. The existing component already does.

---

## The live map

### The layers

The tile provider supplies **only the background picture**. Everything else is
drawn by us and is fully under our control — the tile choice has no effect on any
of it.

```text
┌─────────────────────────────────────────────┐
│  rider markers   ← ours: blinking, tappable │
│  route polyline  ← ours                     │
│  map tiles       ← the free background      │
└─────────────────────────────────────────────┘
```

### Rider markers

One marker per rider, positioned from `participant_last_location`, refreshed by
polling `GET /events/:id/live` every 10–15 s.

**Update, never redraw.** Move existing markers and add/remove only what changed.
Clearing and rebuilding the layer on every poll makes the map flicker and loses
the user's pan and zoom.

Marker appearance carries status at a glance:

| Rider state | Marker |
|---|---|
| Transmitting normally | solid colour dot |
| No point for a few minutes | faded / hollow — "stale" |
| Finished | muted, smaller |
| **SOS active** | **red, blinking** |

Use `L.divIcon`, which lets a marker be our own HTML and CSS. That is what makes
blinking possible — a CSS animation on the marker element:

```css
@keyframes sos-blink { 0%, 100% { opacity: 1 } 50% { opacity: .25 } }
.riderMarker[data-sos="true"] { animation: sos-blink 1s infinite; }
```

Respect `prefers-reduced-motion`: replace the blink with a solid red ring for
users who have that set.

### Tap a rider → detail modal

Markers fire a click event. It opens **our own React modal**, not a Leaflet popup,
so it can hold real content and work well on a phone.

The modal shows:

- name, and bib number for races
- current status
- last update time — "2 minutes ago"
- last known position
- distance travelled
- **distance from me** — straight line from the organizer's own position

All times in the modal are shown in the **viewer's own local time**. The API sends
UTC; the browser converts. A rider in Israel and a rider in Italy each see their
own clock, reading the same instant.

Commissaire already has this pattern (`RiderLiveModal`) — reuse the interaction
design.

### Rider search

Search by name or bib, then centre the map on that rider and open their modal.
Necessary once there are more than a handful of markers on screen.

### SOS on the map

**v1 scope: the marker blinks red. That is all.**

A rider whose latest point has `emergency = true` gets the blinking red marker
described above. Nothing else changes in v1.

Deliberately **later**, not now:

- showing the rider's name and emergency phone at their location
- pinning SOS riders to the top of the rider list
- notifications to organizers or other riders
- an SOS history view

The `emergency` flag is stored on every point, so all of this can be built later
without changing the app or losing past data.

### Performance at 1000 riders

- one marker layer group, updated in place
- markers only for riders with a recent position
- cluster or thin out markers below a zoom threshold
- the poll response is small — one row per rider, not a track
- never re-fit the map bounds automatically after the first load; it fights the
  user's panning

---

## Screen sizes

The map is the main object on both the live screen and the route browser.

| Size | Behaviour |
|---|---|
| Phone | Map on top, list below. Full-width cards. |
| Tablet | **Bigger map.** Two-column route cards. Rider list beside the map. |
| Desktop | **Map dominates.** Three-column route cards. Rider list in a side panel, not stacked. |

The desktop layout is not a stretched phone layout — the extra space goes to the
map, because reading terrain is the whole point.

---

## Route reuse in the event flow

```text
Create event
   -> Choose route
        ├─ Upload a file        (GPX / TCX / JSON / GeoJSON)
        ├─ Draw on the map
        ├─ My routes            (map preview cards)
        └─ Public routes        (map preview cards, filters, paging)
   -> Route attached via event_routes
```

Attaching a route **copies nothing** — `event_routes` points at the route row, so
one route serves many events. If a route's owner deletes it, events keep working
from the last stored geometry; deletion must not break event history.
