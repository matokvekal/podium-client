# Bike Podium Database Schema

Part of this schema **already exists and is deployed**. The Android transmitter
talks to it today. This document therefore has two parts:

- **Part 1 — Existing tables**, and the changes each one needs
- **Part 2 — New tables** that Bike Podium adds

Source of truth for what exists today:
`server-podium/commissaire-server/prisma/migrations/20260812180327_init/migration.sql`.

## Rules that apply to every table

1. **All timestamps are `TIMESTAMPTZ`, and the database always stores UTC.** The
   live database currently uses `TIMESTAMP(3)` with no timezone — a Prisma
   default. With riders uploading delayed GPS points from the road, this must be
   migrated. It is the single most important correction in this document.

   **Timezone rule for the whole system:**

   | Layer | Rule |
   |---|---|
   | Database | stores **UTC only** |
   | API | sends and receives **UTC** (ISO 8601 with `Z`) |
   | Server logic | compares and sorts in UTC — never converts |
   | Client | converts to the **rider's own local time** for display only |

   A rider in Israel sees Israel time, a rider in Italy sees Italian time, and
   both are reading the same stored instant. The conversion happens in the
   browser, using the device's own timezone — no timezone column is needed
   anywhere.

   Never store a local time. Never compare a local time.
2. **No ORM.** Plain SQL through the `pg` driver. Prisma is being removed — see
   [04-architecture.md](04-architecture.md).
3. **No foreign keys.** `owner_id`, `event_id`, `route_id` are ordinary columns;
   the application enforces the relationships.
4. **Numeric identity IDs** everywhere except `events.id`, which is a UUID because
   it appears in public links.
5. **Indexes only where a real query needs one.** Each index below names its query.
6. **Never rename a column the Android app depends on.** Those are marked.

---

# Part 1 — Existing tables

## `users`

Identity data deliberately does **not** live here; it is in `auth_identities`.

```sql
CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    first_name VARCHAR(200),
    last_name VARCHAR(200),
    nickname VARCHAR(200),
    emergency_phone VARCHAR(100),    -- collected by the app; not displayed in v1
    role VARCHAR(30) DEFAULT 'RIDER',-- global account role: RIDER | COMMISSAIRE
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);
```

**Changes needed**

- timestamps → `TIMESTAMPTZ`
- add `avatar_url VARCHAR(500)` — the Google profile picture, used in lists
- `role` stays, but it is a **global account flag, not an event permission**.
  Who may operate a given event is `event_members.role` (Part 2). Do not overload
  this column.

## `auth_identities`

One row per external login. Google and SMS today.

```sql
CREATE TABLE auth_identities (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL,
    provider VARCHAR(30) NOT NULL,       -- GOOGLE | SMS | EMAIL_PASSWORD
    provider_user_id VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(100),
    password_hash TEXT,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);
```

**Changes needed:** timestamps → `TIMESTAMPTZ`. Nothing else.

## `sessions`

Refresh-token sessions. The refresh token itself is an opaque random value; only
its SHA-256 hash is stored, and a successful refresh rotates it in place.

```sql
CREATE TABLE sessions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL,
    refresh_token_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    device_info TEXT,
    ip_address VARCHAR(64)
);
```

**Changes needed:** timestamps → `TIMESTAMPTZ`. Nothing else.

## `otp_challenges`

SMS login codes. Hashed, attempt-limited, expiring.

```sql
CREATE TABLE otp_challenges (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    phone VARCHAR(100) NOT NULL,
    code_hash TEXT NOT NULL,
    attempt_count INT DEFAULT 0,
    max_attempts INT DEFAULT 5,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    request_ip VARCHAR(64)
);
```

**Changes needed:** timestamps → `TIMESTAMPTZ`. Nothing else.

## `events`

Exists, but is currently minimal — it has no owner and no visibility model.

```sql
CREATE TABLE events (
    id UUID PRIMARY KEY,
    code VARCHAR(32) NOT NULL,       -- ⚠ Android reads this. DDMMYYYY + A/B/C…
    name VARCHAR(255) NOT NULL,
    type VARCHAR(30) DEFAULT 'RIDE', -- ⚠ Android reads this. RIDE | RACE
    requires_bib BOOLEAN DEFAULT FALSE, -- ⚠ Android reads this
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

`type` is already exactly the two kinds Bike Podium needs — `RIDE` and `RACE`.
`code` is already the join code the QR encodes. Both stay as they are.

### ⚠️ `owner_id` is the most important missing column

Today **no event has an owner**. The database cannot answer *"who created this
event?"* — and almost every rule depends on that answer:

- "show my events" — mine by what measure?
- "only the organizer may press Start" — which person is the organizer?
- "only the organizer may add or approve riders"
- private events — private *to whom*?

Add `owner_id` first, and set it on every event at creation. It is a small change
that unblocks nearly everything else.

Roles beyond the owner (letting the owner grant other people permission to operate
the event) come **later** — see `event_members` in Part 2. Owner first, roles
after.

**Columns to add**

```sql
ALTER TABLE events
    ADD COLUMN owner_id BIGINT,                    -- ⚠ nobody owns an event today
    ADD COLUMN display_mode VARCHAR(30) DEFAULT 'standard', -- standard | competition
    ADD COLUMN status VARCHAR(30) DEFAULT 'draft',
    ADD COLUMN visibility VARCHAR(30) DEFAULT 'private',    -- public | private
    ADD COLUMN description TEXT,
    ADD COLUMN location VARCHAR(255),
    ADD COLUMN finished_at TIMESTAMPTZ,

    -- Per-event visibility defaults: what MAY OTHER PEOPLE see.
    -- Per-event, not per-user: a public event has an audience nobody can list
    -- in advance, so there is no user row to grant anything to. What a specific
    -- person may DO is event_members.role instead.
    ADD COLUMN show_event_info BOOLEAN DEFAULT TRUE,
    ADD COLUMN show_participants BOOLEAN DEFAULT FALSE,
    ADD COLUMN show_route BOOLEAN DEFAULT TRUE,
    ADD COLUMN show_live_locations BOOLEAN DEFAULT FALSE,
    ADD COLUMN show_history_locations BOOLEAN DEFAULT FALSE,
    ADD COLUMN show_results BOOLEAN DEFAULT TRUE;
```

**`is_active` vs `status`.** `is_active` is what the Android app checks when
looking up an event by code, so it stays. `status` carries the fuller lifecycle.
The rule: `is_active = (status NOT IN ('draft', 'cancelled', 'finished'))`. The
application maintains both together; the app keeps working unchanged.

## `event_participants`

The start list. **⚠ The Android app depends on this table's `id`** — that is the
`participantId` it receives from `/events/join` and sends with every location
batch. The id and the table name must not change.

```sql
CREATE TABLE event_participants (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id UUID NOT NULL,
    user_id BIGINT,                  -- see below: must become nullable
    bib VARCHAR(16),                 -- ⚠ Android sends this on join
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    left_at TIMESTAMPTZ
);
```

**Change 1 — `user_id` must become nullable.** It is currently `NOT NULL`, which
means a participant must have an account. But the brief requires manual entry and
Excel import, where the rider has never opened the app. Those rows have no user.

The existing `UNIQUE (event_id, user_id)` still works: PostgreSQL treats NULLs as
distinct, so many account-less participants can coexist in one event while a real
user still cannot join the same event twice.

**Change 2 — add the fields a start list needs**

```sql
ALTER TABLE event_participants
    ADD COLUMN name VARCHAR(200),    -- for participants with no user account
    ADD COLUMN email VARCHAR(255),
    ADD COLUMN phone VARCHAR(100),
    ADD COLUMN category VARCHAR(80), -- races only

    -- THREE INDEPENDENT AXES. Do not merge these into one column.
    -- A rider can be approved AND present AND finished at the same time;
    -- a single status column cannot express that.
    ADD COLUMN registration_status VARCHAR(30) DEFAULT 'registered',
    ADD COLUMN attendance_status VARCHAR(30) DEFAULT 'unknown',
    ADD COLUMN result_status VARCHAR(30) DEFAULT 'none',

    -- Basic results only: finish time and place. No laps, no waves,
    -- no per-category scoring in v1.
    ADD COLUMN finished_at TIMESTAMPTZ,
    ADD COLUMN finish_position INT;
```

Display name resolution: use `event_participants.name` when set, otherwise the
linked user's name. A rider with an account does not retype their name per event.

> The three-axis split follows the lesson recorded in
> `examples/old-commissire/docs/app-rules.md` §0, where `raceStatus` and `status`
> are deliberately kept as separate fields.

## `location_points`

Raw incoming GPS. High volume. **The only table that is ever deleted from.**

**⚠ Column names match the Android app's JSON exactly** (`lat`, `lng`,
`accuracy`, `recordedAt`, `emergency`). Do not rename them.

```sql
CREATE TABLE location_points (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id UUID NOT NULL,                -- ADD: see below
    participant_id BIGINT NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    accuracy DOUBLE PRECISION,
    recorded_at TIMESTAMPTZ NOT NULL,      -- GPS time on the device
    received_at TIMESTAMPTZ DEFAULT NOW(), -- when the server got it
    emergency BOOLEAN DEFAULT FALSE        -- rider pressed SOS
);
```

**How a point is attributed.** The transmitter joins the event first
(`POST /api/v1/events/join` with the event code) and receives a `participantId`.
Every batch carries that id, and the server verifies the participant belongs both
to the calling user and to the event in the URL.

**`event_id` is added and stored on every point.** Strictly it could be derived by
joining through `event_participants`, but storing it directly is worth it:

- **Retention cleanup** becomes one statement —
  `DELETE FROM location_points WHERE event_id = $1 AND recorded_at < $2` — instead
  of a join across millions of rows
- **"All points for this event"** (rebuilding tracks, statistics, export) needs no
  join
- If a participant row is ever removed or reassigned, the points still say which
  event they belonged to

The client already sends the event in the URL
(`POST /events/:eventId/locations/batch`), so the server has it at write time. It
costs 16 bytes per row and saves a join on the two heaviest queries in the system.

```sql
CREATE INDEX idx_location_points_event_time
    ON location_points (event_id, recorded_at);   -- retention + export
```

**No `speed` or `heading`.** The app does not send them; such columns would always
be NULL. Speed can be derived from consecutive points if a screen ever needs it.

`recorded_at` and `received_at` are separate on purpose: a rider can upload a
six-hour-old point after leaving a dead zone, and ride time must come from the
device clock, never the upload time.

**Change needed:** `TIMESTAMP(3)` → `TIMESTAMPTZ`. Required, not a preference.

### `emergency` — the SOS flag

The transmitter has an SOS button; points sent while it is active carry
`emergency = true`. This already works end to end in the app and the database, so
it is specified here rather than left to be discovered.

**v1 scope is deliberately small: the rider's marker blinks red on the live map.**
That is all.

The flag is stored on every point, so the data is there when the feature grows.

Later, not now:

- showing the rider's name and `emergency_phone` at their location
- push notifications to organizers or other riders
- an SOS history view

`users.emergency_phone` is already collected by the app. It is simply not
displayed yet.

---

# Part 2 — New tables

## `event_members` — who may operate an event

`users.role` is a global account flag. Bike Podium needs roles **per event**: a
person can own one ride and merely watch another.

```sql
CREATE TABLE event_members (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id UUID NOT NULL,
    user_id BIGINT NOT NULL,
    role VARCHAR(30) NOT NULL,       -- owner | operator | viewer
    joined_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `event_members` vs `event_participants` — the rule

These two tables both connect a user to an event and are easy to confuse. The
distinction is fixed:

| | `event_members` | `event_participants` |
|---|---|---|
| Means | **Who may operate the event** | **Who is on the start list** |
| Needs an account | Yes | No — `user_id` may be NULL |
| Created by | Owner assigning a role | Manual entry, Excel import, or self-registration |
| Holds | `role` | registration / attendance / result status, bib, category |
| Example | An operator who marks finishers but does not ride | A rider imported from a spreadsheet who never opened the app |

A person who rides *and* helps organize has a row in **both**.
**Approval status lives only on `event_participants`** and is never duplicated.

## `routes`

Stored **independently of any event**, so one route serves many events and can be
shared with other users.

```sql
CREATE TABLE routes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_id BIGINT,
    name VARCHAR(255),
    route_type VARCHAR(50),          -- road | gravel | mtb | mixed

    -- how it was created: gpx | tcx | geojson | json | drawn | copied
    source VARCHAR(50),

    distance_km DOUBLE PRECISION,
    elevation_m DOUBLE PRECISION,

    track_points JSONB,              -- full geometry [[lat, lng], ...]
    markers JSONB,                   -- [{lat, lng, label, type}, ...]

    -- Small simplified copy, so browsing the public library never loads
    -- full geometry.
    preview_points JSONB,
    point_count INT,

    is_public BOOLEAN DEFAULT FALSE, -- owner published it
    place_name VARCHAR(255),         -- free text: "Galilee", "Ashkelon"
    start_lat DOUBLE PRECISION,
    start_lon DOUBLE PRECISION,
    end_lat DOUBLE PRECISION,
    end_lon DOUBLE PRECISION,
    bbox_min_lat DOUBLE PRECISION,
    bbox_min_lon DOUBLE PRECISION,
    bbox_max_lat DOUBLE PRECISION,
    bbox_max_lon DOUBLE PRECISION,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE event_routes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id UUID NOT NULL,
    route_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Everything from `distance_km` down to `bbox_max_lon` is computed once at upload
time by the route parser, so browsing never opens the geometry. See
[08-routes-and-maps.md](08-routes-and-maps.md).

## `participant_last_location` — the live map

The live map asks one question: *where is everyone right now?* Answering it from
`location_points` means scanning a table that grows all event long. Instead,
ingest upserts one row per participant and the map reads only this table.

```sql
CREATE TABLE participant_last_location (
    event_id UUID NOT NULL,
    participant_id BIGINT NOT NULL,
    recorded_at TIMESTAMPTZ,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    accuracy DOUBLE PRECISION,
    emergency BOOLEAN DEFAULT FALSE,
    distance_travelled_km DOUBLE PRECISION,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (event_id, participant_id)
);
```

Only newer points overwrite. A late batch of old points must never drag a rider
backwards on the map:

```sql
UPDATE participant_last_location
   SET ...
 WHERE event_id = $1 AND participant_id = $2
   AND (recorded_at IS NULL OR recorded_at < $new_recorded_at);
```

The primary key `(event_id, participant_id)` already serves the live query — no
extra index is needed.

## `participant_tracks` — the kept history

Written **once, when the event finishes**: each participant's ride reduced to a
simplified line. This is what the History screen draws.

```sql
CREATE TABLE participant_tracks (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id UUID NOT NULL,
    participant_id BIGINT NOT NULL,
    points JSONB,                    -- simplified [[lat, lng], ...]
    point_count INT,
    distance_km DOUBLE PRECISION,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    had_emergency BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**This table is never purged.**

## `client_actions` — offline de-duplication

The PWA queues actions while offline and replays them on reconnect. A retry the
server already applied must not apply twice — a rider marked finished twice, a
participant added twice.

Every mutating request carries a client-generated `client_action_id` (UUID). The
server records it and ignores repeats.

```sql
CREATE TABLE client_actions (
    client_action_id UUID PRIMARY KEY,
    user_id BIGINT,
    event_id UUID,
    action_type VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

A duplicate returns **HTTP 409** carrying the original result — not an error the
user ever sees. Same principle as Commissaire's cloud sync (client-generated ids,
first accepted wins): `examples/old-commissire/docs/cloud/1-overview.md`.

`client_actions` may be purged on the same schedule as `location_points`.

The transmitter's `/events/join` is **already idempotent** by upsert, so it needs
no action id.

---

## Retention policy

| Data | Kept? |
|---|---|
| Events | **Forever** |
| Participants and results | **Forever** |
| Routes | **Forever** |
| `participant_tracks` — the ride line shown in history | **Forever** |
| `location_points` — raw GPS, many per rider per minute | **Deleted** after the retention window |

Only the raw point stream is deleted, because it is the only thing that grows
without limit: a 1000-rider event at one point every 10 seconds produces millions
of rows, none of which are needed once the simplified track exists.

Rules:

- the retention window is configurable in environment settings (suggested default:
  30 days after the event finishes)
- **the cleanup job must not run for an event until its `participant_tracks` rows
  exist.** Losing the track is the one outcome this whole design exists to prevent
- deleting raw points never changes what the History screen shows

---

## Indexes

Existing indexes (keep):

```sql
-- auth_identities (provider, provider_user_id) UNIQUE   -- login lookup
-- auth_identities (user_id)
-- sessions (refresh_token_hash) UNIQUE                   -- refresh lookup
-- sessions (user_id), sessions (expires_at)
-- events (code) UNIQUE                                   -- join by code / QR
-- event_participants (event_id), (user_id)
-- event_participants (event_id, user_id) UNIQUE
-- location_points (participant_id, recorded_at)          -- track rebuild
-- otp_challenges (phone), (expires_at)
```

New indexes, each with its query:

```sql
-- Events page: current / upcoming / past
CREATE INDEX idx_events_status_start ON events (status, start_time);

-- "Events I own"
CREATE INDEX idx_events_owner ON events (owner_id);

-- "Events I operate"
CREATE INDEX idx_event_members_user ON event_members (user_id);
CREATE INDEX idx_event_members_event ON event_members (event_id);

-- Active SOS riders in one event
CREATE INDEX idx_location_points_emergency
    ON location_points (participant_id, recorded_at DESC)
    WHERE emergency = TRUE;

-- History screen
CREATE INDEX idx_participant_tracks_event ON participant_tracks (event_id);

-- My route library
CREATE INDEX idx_routes_owner ON routes (owner_id);
-- Public route browser, newest first
CREATE INDEX idx_routes_public
    ON routes (is_public, created_at DESC) WHERE is_public = TRUE;
-- Public route browser, "near this area"
CREATE INDEX idx_routes_public_start
    ON routes (start_lat, start_lon) WHERE is_public = TRUE;
```

---

## Status values

### Event type — exactly two (existing, uppercase, read by Android)

- `RIDE`
- `RACE`

### Display mode — exactly two

- `standard`
- `competition`

### Event status

- `draft`
- `published`
- `registration_open`
- `ready`
- `live`
- `finished`
- `cancelled`

### Event visibility

- `public`
- `private`

### Event member role

- `owner`
- `operator`
- `viewer`

### Global account role (existing)

- `RIDER`
- `COMMISSAIRE`

### Participant — registration_status

- `registered`
- `waiting_approval`
- `approved`
- `rejected`

### Participant — attendance_status

- `unknown`
- `present`
- `dns`
- `started`

### Participant — result_status

- `none`
- `finished`
- `dnf`
- `stopped`
- `unknown`

---

## Design notes

- One shared location table for all events. Never one table per event.
- Three location tables, because they have three different **lifetimes**, not
  three different shapes: raw points (purged), latest position (live map), saved
  track (kept forever).
- Visibility is per event; roles are per user. Different questions, different
  tables.
- Keep database-level relationships out of v1; enforce them in application code.
- Never rename a column the Android app reads.

## Planned next schema evolution

When a real requirement appears, not before:

- richer route metadata (surface type, segments)
- an event settings table, if per-event options outgrow the `events` columns
- audit log
- partitioning `location_points` by month, if retention alone proves insufficient
