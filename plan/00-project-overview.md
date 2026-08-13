# Bike Podium Project Overview

## Goal

Bike Podium is a cycling event platform that supports event creation, participant management, route sharing, and optional live rider tracking.

The system is intended for:

- private club rides
- weekend group rides
- organized rides and tours
- gravel events
- road races
- MTB races
- XCO / XCC races

The core idea is to let an organizer create an event, invite or register riders, attach a route, publish the event, and monitor rider position during the event.

## Product vision

Bike Podium combines three things:

1. event organization
2. participant management
3. live rider tracking

The product should remain easy to operate for a small club ride but scalable enough for larger events.

## Main components

### 1. Bike Podium Web Application

Technology: React PWA.

Used by:

- organizers
- operators
- riders
- spectators

Goals:

- event listing and management
- card / list / map-based event navigation
- route visualization
- participant status management
- live rider tracking
- app works in low-connectivity conditions

### 2. Backend Server

Technology:

- Node.js
- TypeScript
- PostgreSQL
- Linux-friendly deployment model

Responsibilities:

- authentication
- user accounts
- events
- participants
- permissions
- routes
- rider locations
- event status
- history
- synchronization with clients

### 3. Rider Transmitter

**The existing Android app is the only GPS source in v1.** The web app does not
transmit location. Browser background geolocation is throttled or killed when the
screen turns off, which makes it unusable for a four-hour ride — that is why the
Android app exists.

Responsibilities:

- collect GPS points
- queue points locally if offline
- send points to the server when the network is available
- allow rider control over when sharing is enabled

The Android app is **already built and working**, and its API is fixed: the server
must match what the app already sends, not the other way round. The exact contract
is recorded in [07-api-contract.md](07-api-contract.md).

An iOS transmitter, and possibly location sharing from the PWA, may come later.
Neither is in v1.

## Glossary

These words are used precisely throughout the documentation. They are not
interchangeable.

| Term | Meaning |
|---|---|
| **User** | An account. Created at first Google sign-in. |
| **Member** | A user with a role on an event: owner, operator, or viewer. Controls what they may *do*. |
| **Participant** | An entry on an event's start list. May have no user account at all (added manually or from Excel). |
| **Rider** | A participant who is transmitting GPS during the event. |
| **Viewer** | Someone looking at an event without a role on it. Sees only what the event's visibility settings allow. |

A person can be several of these at once: a club captain who organizes the ride
and also rides it is an owner **member** and a **participant** and, once
transmitting, a **rider**.

## Event types

There are exactly **two kinds of event**, and separately **two visual styles**.
These are different things and must not be confused.

### The two kinds — what the event does

#### 1. Ride

Best for:

- club ride
- Saturday group ride
- social ride
- gravel ride
- training ride
- cycling tour

Flow:

- create event
- add riders
- choose route
- publish
- start
- live map
- finish
- history

No bib numbers, no categories, no finishing order required.

#### 2. Race

Everything a ride has, plus:

- start list
- bib numbers
- categories
- finish time and finishing position

The race is the same lifecycle with more fields — not a different application.

### The two styles — how the event looks

The style is a presentation setting chosen when the event is created. It changes
colours, density and emphasis. **It never changes behaviour, data, or the event
lifecycle.**

| Style | For | Qualities |
|---|---|---|
| `standard` | Most events, both rides and races | Calm, minimal, easy to scan, low visual clutter |
| `competition` | Timed and competitive events | Higher data density, stronger status emphasis, tactical rather than decorative |

A gravel event that wants to look serious picks `race`-grade polish by choosing
the `competition` style — it does not become a third kind of event. Any kind can
use any style.

The UI should feel professional and premium, not playful or cartoonish.

## Page philosophy

The old Commissaire app is a good reference for the event workflow, but the new Bike Podium must avoid heavy UI clutter.

The design goal is:

- very few screens
- simple event creation
- clean live page
- easy history access
- minimal extra cards or decorative complexity
- focus on the actual ride lifecycle

The main screens should be:

- login
- events list
- event create / edit
- event detail
- live map
- past event history
- participant list
- route selection

The app should not feel like a complex admin dashboard by default.

## Screen sizes

The app is used on a phone at the start line and on a laptop or tablet at the
organizer's table. It must work well on both — this is not "mobile with a wide
margin".

- **Phone** — the primary case. Compact lists, thumb-reachable actions.
- **Tablet and desktop** — the **map gets noticeably bigger**. On the live screen
  and the route browser the map is the main object on the page, with the rider or
  route list beside it rather than stacked under it.

Full breakpoint and layout rules: [09-nfr-privacy-testing.md](09-nfr-privacy-testing.md).

## Roles and permissions

### Event Owner

- create and edit event
- manage participants
- approve/reject riders
- change event visibility
- start/finish event
- assign operators
- upload/select route

### Authorized operator

- add participants
- remove participants
- update status
- mark attendance
- mark finishers

### Viewer

- only see what the owner allows

## Authentication

**Already built and running.** Full detail: [05-auth-jwt.md](05-auth-jwt.md).

Two ways to sign in — **Google** and **SMS one-time code**. Both only establish
identity; the server then issues its own tokens, and every other route accepts
only those.

- access token: JWT, 15 minutes
- refresh token: opaque random value, 30 days, rotated on every use, stored only
  as a hash
- session revoke and logout-all supported

Two kinds of role, deliberately separate:

- `users.role` — a **global** account flag (`RIDER`, `COMMISSAIRE`)
- `event_members.role` — what you may do **on one event** (`owner`, `operator`,
  `viewer`)

Event permission checks always use `event_members`. A person may own one ride and
merely watch another.

### Server implementation principles

- Express + TypeScript + PostgreSQL, kept simple
- **no ORM** — plain SQL through the `pg` driver
- no Redis requirement, no microservice layer
- focused middleware: CORS allowlist, JSON parsing, auth, rate limiting, logging,
  error handling
- do not build advanced infrastructure before the business flow works

## Core user flows

### Organizer flow

```text
CREATE EVENT
  -> ADD / INVITE RIDERS
  -> SELECT ROUTE
  -> PUBLISH
  -> MARK WHO ARRIVED
  -> START
  -> LIVE MAP
  -> MARK FINISHERS
  -> FINISH EVENT
  -> HISTORY
```

### Rider flow

```text
LOGIN
  -> JOIN EVENT
  -> START LOCATION SHARING
  -> RIDE
  -> STOP LOCATION SHARING
```

## Privacy and visibility

Events can be public or private.

This is a core product decision and should be part of basic event creation.

### Event visibility types

- Public event
  - visible to users who are browsing events
  - limited by the organizer's chosen permissions

- Private event
  - only invited or allowed users can access it
  - useful for friends rides, private club rides, and closed events

### Per-item sharing controls

The organizer can separately control what others are allowed to see:

- general event info
- participant list
- route
- live locations
- historical locations
- results

This means an event may be public while still hiding the participant list or live tracking. Likewise, a private event may still expose a selected route or historical results under limited permissions.

Visibility is **per event**, not per viewer: a public event has an audience nobody
can list in advance, so these settings are properties of the event itself. What an
individual person is allowed to *do* is their member role, which is a separate
question.

### Registration model

User participation supports both organizer-controlled and self-service onboarding.
There are four ways a participant reaches the start list:

1. **Pick an existing user** — select riders already registered in Bike Podium.
2. **Manual entry** — the organizer types the participant in. No account needed.
3. **Excel import** — import a start list from a spreadsheet. Required by the
   brief; the column-matching import wizard is reused from Commissaire.
4. **Registration link, event code, or QR** — riders open it and register
   themselves.

The event decides whether self-registration needs organizer approval:

```text
registered -> waiting_approval -> approved
```

- Organizer can add, edit, delete, approve, reject, and mark attendance
- Public events can allow open self-registration
- Private events can require an invite, the event code, or organizer confirmation
- Races additionally use bib number and category

This supports private friends rides, closed club events, and public events where
users join themselves without organizer intervention.

## Offline and poor connectivity behavior

Bike Podium must work in the real conditions of cycling events.

Riders often ride in areas with no cell coverage or weak Wi-Fi. That means the transmitter and the web app must tolerate offline periods.

### Rider transmitter behavior

- collect GPS data locally when no network is available
- queue the points in local storage or a local database
- upload in batches when the rider reaches an area with coverage
- preserve the original GPS timestamps
- do not rely on upload time as the real ride time

### Frontend behavior

- cache event data locally so basic event information remains usable offline
- queue user actions and changes until network is available again
- retry sync automatically when the connection returns

This is not a special feature; it is a core requirement for real-world riding.

A replayed offline action must not apply twice. Every change the app sends carries
a client-generated action id so the server can recognise a repeat — see
[02-database-schema.md](02-database-schema.md).

## Routes and tracks

A route is stored **independently of any event**, so one route serves many events
and can be shared with other users.

A route can be created four ways:

1. **Upload a Garmin-standard file** — GPX or TCX
2. **Upload points** — JSON or GeoJSON, or a simple start / middle / end point list
3. **Draw it in the app** by tapping the map
4. **Reuse an existing route** — the user's own, or another user's public route

Reusing must be **visual, not a dropdown**. The route browser shows cards with
name, place, distance and elevation, each with a **map preview**, browsable page by
page — the way route libraries like Strava work. The point is that an organizer
recognises a route by looking at it, then reuses it in one tap.

Routes are private until the owner publishes them. Only published routes appear in
the public library.

Full detail: [08-routes-and-maps.md](08-routes-and-maps.md).

## Privacy of location data

This product continuously collects and displays the real-time position of real
people, including minors on club rides. That carries obligations the rest of the
app does not.

- A rider must actively agree before any location is transmitted.
- Stopping sharing must take effect immediately and be reachable in one action.
- Users must be told, in plain language, how long their location data is kept.
- An organizer can hide live locations for an event entirely.

Details and the retention statement: [09-nfr-privacy-testing.md](09-nfr-privacy-testing.md).

## Data model strategy

Important product decisions:

- one shared location table for all events — never one table per event
- three location tables serving three different lifetimes: raw incoming points
  (purgeable), latest position per rider (live map), and the saved track (history)
- **only raw GPS points are ever deleted.** Events, participants, results, routes
  and saved tracks are kept permanently
- do not introduce an ORM
- avoid foreign-key constraints in v1
- keep IDs simple and mostly numeric
- use UUID only for the event's public identifier
- all timestamps are timezone-aware

## Dependencies and reference materials

- [examples/old-commissire](../examples/old-commissire) — reference for UX, bike-event workflows, route parsing, the map component, and the Excel/CSV import wizard
- [examples/old-example servers](../examples/old-example%20servers) — reference for Node/TypeScript server structure, validation, middleware, and configuration
- [client-podium](../client-podium) — frontend workspace
- [server-podium](../server-podium) — backend workspace

Reference folders are **read-only**. Reuse ideas and code from them; never edit them.
What to take from each: [10-reuse-from-references.md](10-reuse-from-references.md).

## MVP scope

### In scope

- event creation and management, two kinds and two styles
- participants: manual, existing user, Excel import, and self-registration by link / code / QR
- approval and attendance
- routes: upload, draw, reuse own, browse and reuse public
- start / finish event
- live map with rider positions
- basic results — finish time and finishing position
- history, including saved rider tracks
- offline-safe behavior with de-duplicated replay
- location consent and a stated retention policy

### Out of scope for v1

- multi-service architecture
- Redis requirement
- Kafka requirement
- complex race scoring engine
- proprietary location DB
- WebSocket-based real-time system as first implementation

## Design principles

- keep it practical and simple
- do not over-engineer
- build for reliability in poor network conditions
- keep the API and schema forward-compatible
- design for polling first, then upgrade later to SSE/WebSocket without requiring major redesign
