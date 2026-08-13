# Non-Functional Requirements, Privacy and Testing

Things the product must be true about, beyond features.

---

# 1. Scale targets

| Case | Riders |
|---|---|
| Private ride | 5–30 |
| Club event | 30–150 |
| Large event or race | 150–1000+ |

Concurrency to plan for: **10 active events, ~500 riders total, uploading at once.**

## Transmission budget

| Setting | Value | Why |
|---|---|---|
| GPS sample interval | 5–10 s | enough for a map, cheap on battery |
| Upload interval | every 30–60 s | batched, not per point |
| Points per batch | up to **200** (enforced) | covers ~30 min offline at 10 s |
| Request body limit | 100 kb (enforced) | 200 points is ~20 kb, comfortable |
| Live map polling | 10–15 s | matches upload cadence; faster gains nothing |

The system must **not** assume every GPS point causes a UI update.

## Performance targets

| Operation | Target |
|---|---|
| `GET /events/:id/live` at 1000 riders | < 300 ms |
| Location batch ingest | < 200 ms |
| Route browser page (20 cards) | < 500 ms |
| Event list | < 300 ms |

`GET /live` meets its target only because it reads `participant_last_location`
(one row per rider) and never `location_points`. If that ever changes, the target
is gone.

## Rate limiting

Global: 300 requests / 15 min per IP. SMS request: 10 / 15 min. SMS verify: 30 / 15 min.

⚠️ **The location endpoint must not be limited per IP.** Riders on mobile networks
share carrier NAT addresses, so at a large event many real riders appear as one IP
and get throttled. Key its limiter on `req.auth.userId`.

---

# 2. Technology decisions

| Concern | Decision | Why |
|---|---|---|
| Map library | **Leaflet** | open source, free forever, proven in Commissaire |
| Map tiles | **OpenStreetMap**, URL in config | no API key, no billing account; swappable in one line |
| Not Google Maps | — | needs a credit card on file, charges on overage, forbids tile caching |
| Leaflet loading | **lazy only** | eager import cost 65 kB → 559 kB in Commissaire |
| Route parsing | reuse `parseTrack.ts` | already handles GPX/TCX/JSON/GeoJSON |
| Real-time | **polling first** | simplest thing that works; contract allows SSE/WS later |
| Database access | plain `pg` + SQL | brief forbids an ORM |
| Client framework | React + TypeScript + Vite, PWA | |

## Browser and device support

- **Phones:** current Chrome on Android, current Safari on iOS. The primary case.
- **Desktop:** current Chrome, Edge, Firefox, Safari.
- No Internet Explorer, no legacy Edge.
- The PWA must be installable and open its cached shell offline.
- **The PWA never transmits GPS in v1** — that is the Android app's job.

---

# 3. Location privacy

This product continuously collects and displays the real-time position of real
people, including minors on club rides. That carries obligations the rest of the
app does not.

## Requirements

1. **Consent before transmission.** A rider must actively agree before any
   location leaves their device. Not a pre-ticked box, not buried in terms.
2. **Stop must be one action** and take effect immediately. The rider controls
   sharing at all times — never the organizer.
3. **Say how long data is kept**, in plain language, where the rider agrees.
4. **The organizer can disable live locations** for an entire event
   (`show_live_locations = false`).
5. **Historical positions are separately controlled**
   (`show_history_locations`) — an event may show live positions during the ride
   and hide the tracks afterwards.

## What riders should be told

> While you share your location, the event organizer can see where you are on the
> course. Your detailed GPS points are deleted 30 days after the event. A
> simplified line of your ride is kept with the event history. You can stop
> sharing at any time.

Keep it accurate — if the retention window changes, change this text.

## SOS and the emergency phone

`users.emergency_phone` is collected by the Android app but **is not displayed
anywhere in v1**. The only SOS behaviour in v1 is a red blinking marker on the
live map.

When it is eventually shown, it must be visible to organizers **only while that
rider has an active SOS** — never as part of the normal participant list. State
that where the rider enters the number, so the promise matches the behaviour.

## Reuse

Commissaire already has versioned consent:
`examples/old-commissire/src/app/legal/terms.ts` and `termsAcceptance.ts`
(`hasAcceptedCurrentTerms`, `acceptCurrentTerms`, bump the version to re-prompt).
Copy the mechanism; the text must be written for Bike Podium.

## Not covered in v1

Formal GDPR tooling — data export, right-to-erasure workflows. If the product goes
public in the EU this must be revisited before launch, not after.

---

# 4. Testing standard

## The rules catalog

Adopt the pattern from `examples/old-commissire/docs/app-rules.md`: every
behavioural rule gets a **stable ID**, and the ID is the test name.

```
RULE-LOC-01  A location batch is rejected unless the participant belongs
             to both the calling user and the event in the URL.
RULE-LOC-02  participant_last_location is updated only when the incoming
             point is newer than the stored one.
RULE-LOC-03  recorded_at is taken from the payload, never from arrival time.
RULE-RET-01  The cleanup job skips any event with no participant_tracks rows.
RULE-VIS-01  A non-member reading /live gets 403 when show_live_locations
             is false.
RULE-DUP-01  A repeated X-Client-Action-Id returns 409 with the original
             result and changes nothing.
```

Write the rule when you write the behaviour. If code changes, update the rule.

## What must have tests

- **Auth** — already covered; keep it that way through the Prisma removal
- **Location ingest** — ownership check, newer-only upsert, batch limits, timestamps
- **Permissions** — every role against every mutating endpoint
- **Visibility** — each `show_*` flag, as a member and as a stranger
- **Retention** — never deletes points for an event without tracks
- **Offline replay** — the same action id applied twice changes nothing

## Manual checks that cannot be automated here

The Android app is not in this repo, so these are run by hand and are **required**
after any change to auth or ingest:

1. Real app joins an event by code
2. Real app transmits; points land with correct `recorded_at`
3. Airplane mode for two minutes mid-ride; on reconnect the queued points arrive
   with their **original** timestamps
4. SOS button sets `emergency = true` and the map blinks red

Check 3 is the one that catches timestamp regressions.

## Commands

```bash
cd server-podium
npm test          # vitest
npm run typecheck
npm run lint      # biome
```

All three must be clean before a change is considered done.
