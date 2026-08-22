# ElNino System Schematic and DB Entity Map

**Date:** 2026-08-22  
**Based on:** architecture, schema, and API contract documents in `plan/`

## 1) Full System Schematic

```mermaid
flowchart LR
    U[Rider / Operator Browser\nPWA React + Vite] -->|Google GIS| G[Google Identity Services]
    U -->|HTTPS JSON| API[Podium API\nExpress 5 + TypeScript]
    A[Android Transmitter\nGPS batching, offline queue] -->|HTTPS JSON| API

    API --> AUTH[Auth Module\nGoogle/SMS/JWT]
    API --> USERS[Users Module]
    API --> EVENTS[Events Module]
    API --> MEMBERS[Event Members Module]
    API --> ROUTES[Routes Module]
    API --> TRACKING[Tracking Module]
    API --> RESULTS[Results Module]

    AUTH --> DB[(PostgreSQL)]
    USERS --> DB
    EVENTS --> DB
    MEMBERS --> DB
    ROUTES --> DB
    TRACKING --> DB
    RESULTS --> DB

    SW[Service Worker + Offline Queue\nClient Action Replay] --> U
```

## 2) Runtime Interaction Flow

```mermaid
sequenceDiagram
    participant PWA as PWA Client
    participant GIS as Google Identity Services
    participant API as Express API
    participant DB as PostgreSQL
    participant AND as Android App

    PWA->>GIS: Initialize Google sign-in (client_id)
    GIS-->>PWA: idToken
    PWA->>API: POST /api/v1/auth/google
    API->>DB: upsert user/auth identity/session
    DB-->>API: user + session rows
    API-->>PWA: accessToken + refreshToken

    AND->>API: POST /api/v1/events/join
    API->>DB: upsert event_participants
    DB-->>API: participantId
    API-->>AND: participantId

    AND->>API: POST /api/v1/events/:eventId/locations/batch
    API->>DB: insert location_points + upsert participant_last_location
    DB-->>API: saved count
    API-->>AND: { saved }

    PWA->>API: GET /api/v1/events/:eventId/live
    API->>DB: read participant_last_location
    DB-->>API: latest rider positions
    API-->>PWA: live map payload
```

## 3) Module Boundaries (Backend)

| Module | Main Responsibility | Primary Tables |
|---|---|---|
| auth | Google/SMS login, refresh rotation, logout/logout-all | `auth_identities`, `sessions`, `otp_challenges`, `users` |
| users | Profile update/read | `users` |
| events | event lifecycle, join by code, basic event retrieval | `events`, `event_participants` |
| members | per-event permission roles | `event_members` |
| tracking | ingest GPS, serve live positions, keep history track | `location_points`, `participant_last_location`, `participant_tracks` |
| routes | upload/draw/publish/reuse route library | `routes`, `event_routes` |
| results | finish state and standings | `event_participants`, `participant_tracks` |
| offline dedup | prevent duplicate replay effects | `client_actions` |

## 4) Complete DB Entity Diagram

```mermaid
erDiagram
    users {
        BIGINT id PK
        VARCHAR first_name
        VARCHAR last_name
        VARCHAR nickname
        VARCHAR emergency_phone
        VARCHAR role
        BOOLEAN is_active
        VARCHAR avatar_url
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
        TIMESTAMPTZ last_login_at
    }

    auth_identities {
        BIGINT id PK
        BIGINT user_id
        VARCHAR provider
        VARCHAR provider_user_id
        VARCHAR email
        VARCHAR phone
        TEXT password_hash
        TIMESTAMPTZ verified_at
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
        TIMESTAMPTZ last_used_at
    }

    sessions {
        BIGINT id PK
        BIGINT user_id
        TEXT refresh_token_hash
        TIMESTAMPTZ created_at
        TIMESTAMPTZ expires_at
        TIMESTAMPTZ revoked_at
        TIMESTAMPTZ last_used_at
        TEXT device_info
        VARCHAR ip_address
    }

    otp_challenges {
        BIGINT id PK
        VARCHAR phone
        TEXT code_hash
        INT attempt_count
        INT max_attempts
        TIMESTAMPTZ created_at
        TIMESTAMPTZ expires_at
        TIMESTAMPTZ consumed_at
        VARCHAR request_ip
    }

    events {
        UUID id PK
        VARCHAR code
        VARCHAR name
        VARCHAR type
        BOOLEAN requires_bib
        TIMESTAMPTZ starts_at
        TIMESTAMPTZ ends_at
        BOOLEAN is_active
        BIGINT owner_id
        VARCHAR display_mode
        VARCHAR status
        VARCHAR visibility
        TEXT description
        VARCHAR location
        TIMESTAMPTZ finished_at
        BOOLEAN show_event_info
        BOOLEAN show_participants
        BOOLEAN show_route
        BOOLEAN show_live_locations
        BOOLEAN show_history_locations
        BOOLEAN show_results
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
    }

    event_members {
        BIGINT id PK
        UUID event_id
        BIGINT user_id
        VARCHAR role
        TIMESTAMPTZ joined_at
    }

    event_participants {
        BIGINT id PK
        UUID event_id
        BIGINT user_id
        VARCHAR bib
        VARCHAR name
        VARCHAR email
        VARCHAR phone
        VARCHAR category
        VARCHAR registration_status
        VARCHAR attendance_status
        VARCHAR result_status
        TIMESTAMPTZ joined_at
        TIMESTAMPTZ left_at
        TIMESTAMPTZ finished_at
        INT finish_position
    }

    location_points {
        BIGINT id PK
        UUID event_id
        BIGINT participant_id
        DOUBLE lat
        DOUBLE lng
        DOUBLE accuracy
        TIMESTAMPTZ recorded_at
        TIMESTAMPTZ received_at
        BOOLEAN emergency
    }

    participant_last_location {
        UUID event_id PK
        BIGINT participant_id PK
        TIMESTAMPTZ recorded_at
        DOUBLE lat
        DOUBLE lng
        DOUBLE accuracy
        BOOLEAN emergency
        DOUBLE distance_travelled_km
        TIMESTAMPTZ updated_at
    }

    participant_tracks {
        BIGINT id PK
        UUID event_id
        BIGINT participant_id
        JSONB points
        INT point_count
        DOUBLE distance_km
        TIMESTAMPTZ started_at
        TIMESTAMPTZ ended_at
        BOOLEAN had_emergency
        TIMESTAMPTZ created_at
    }

    routes {
        BIGINT id PK
        BIGINT owner_id
        VARCHAR name
        VARCHAR route_type
        VARCHAR source
        DOUBLE distance_km
        DOUBLE elevation_m
        JSONB track_points
        JSONB markers
        JSONB preview_points
        INT point_count
        BOOLEAN is_public
        VARCHAR place_name
        DOUBLE start_lat
        DOUBLE start_lon
        DOUBLE end_lat
        DOUBLE end_lon
        DOUBLE bbox_min_lat
        DOUBLE bbox_min_lon
        DOUBLE bbox_max_lat
        DOUBLE bbox_max_lon
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
    }

    event_routes {
        BIGINT id PK
        UUID event_id
        BIGINT route_id
        TIMESTAMPTZ created_at
    }

    client_actions {
        UUID client_action_id PK
        BIGINT user_id
        UUID event_id
        VARCHAR action_type
        TIMESTAMPTZ created_at
    }

    users ||--o{ auth_identities : has
    users ||--o{ sessions : owns
    users ||--o{ event_members : assigned_to
    users ||--o{ event_participants : may_participate
    users ||--o{ routes : owns

    events ||--o{ event_members : grants_roles
    events ||--o{ event_participants : has_start_list
    events ||--o{ location_points : receives_points
    events ||--o{ participant_last_location : has_live_rows
    events ||--o{ participant_tracks : has_history_tracks
    events ||--o{ event_routes : links

    routes ||--o{ event_routes : linked_to_events

    event_participants ||--o{ location_points : emits
    event_participants ||--o{ participant_last_location : latest
    event_participants ||--o{ participant_tracks : summarized_to
```

## 5) Tracking Data Lifecycle

```mermaid
flowchart TD
    B[locations/batch ingest] --> LP[location_points\nRaw GPS stream]
    B --> PLL[participant_last_location\nOne live row per participant]
    LP --> FIN[Event finish process]
    FIN --> PT[participant_tracks\nSimplified kept history]
    LP --> RET[Retention job]
    RET --> DEL[Delete old raw points\nafter tracks exist]
```

## 6) Entity Roles Clarification

| Concept | Table | Meaning |
|---|---|---|
| Who can operate an event | `event_members` | owner/operator/viewer permissions |
| Who is riding/in start list | `event_participants` | registration + attendance + result statuses |
| Who created event | `events.owner_id` | event owner identity |

## 7) Status Enums (Operational View)

### Event
- `type`: `RIDE`, `RACE`
- `display_mode`: `standard`, `competition`
- `status`: `draft`, `published`, `registration_open`, `ready`, `live`, `finished`, `cancelled`
- `visibility`: `public`, `private`

### Membership and Participation
- `event_members.role`: `owner`, `operator`, `viewer`
- `event_participants.registration_status`: `registered`, `waiting_approval`, `approved`, `rejected`
- `event_participants.attendance_status`: `unknown`, `present`, `dns`, `started`
- `event_participants.result_status`: `none`, `finished`, `dnf`, `stopped`, `unknown`

## 8) Non-Functional Architecture Rules

1. UTC everywhere in storage and API timestamps.
2. Android existing endpoint fields are frozen.
3. No ORM; SQL through `pg`.
4. No DB foreign keys in v1; relationships enforced in application logic.
5. `location_points` is the only high-volume purge table; tracks/events/results are retained.

## 9) Quick Ownership Map

| Layer | Primary Owner |
|---|---|
| OAuth client origin allowlist | Google Cloud credentials admin |
| API behavior and auth/session logic | Backend team |
| DB schema migration execution | Backend/DB team |
| PWA rendering and client env | Frontend team |

---

This document is the complete schematic baseline for system design reviews, onboarding, and implementation planning.
