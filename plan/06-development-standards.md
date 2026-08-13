# Development Standards

Standards for naming, structure, testing and documentation, so the project stays
easy to understand and easy to debug.

---

## 1. Naming

Use names that describe the real domain, not vague technical names.

Good: `EventListPage`, `EventCreateForm`, `LiveMapPanel`, `RiderLocationQueue`,
`RouteBrowser`, `EventStatusBadge`

Avoid: `utilX`, `misc`, `dataThing`, `tempHandler`, `weirdComponent`

A developer opening a file should immediately know where they are.

**Do not rename anything the Android app depends on** — see
[07-api-contract.md](07-api-contract.md) Part 1. That includes `participantId`,
`eventCode`, `lat`, `lng`, `recordedAt`, `emergency`.

---

## 2. Server module structure

Every backend module has the same five files:

```text
src/modules/<name>/
  <name>.routes.ts       paths + middleware
  <name>.controller.ts   parse, validate, call service, respond
  <name>.service.ts      business logic and permission checks
  <name>.queries.ts      SQL only
  <name>.schemas.ts      zod schemas
```

**Rules**

- **No SQL outside `*.queries.ts`.** Not in controllers, not in services.
- Always bind parameters (`$1`, `$2`). Never build SQL by string concatenation.
- Database is `snake_case`, API is `camelCase`. Map at the query-file boundary.
- Controllers stay thin: validate, delegate, respond.
- Permission checks live in the service, not the route.

## 3. HTTP status codes

Return real ones: 200, 201, 400, 401, 403, 404, 409, 429, 500.

We deliberately **reject** the reference server's "always return 200" rule — the
PWA must distinguish 401 (re-login) from 403 (forbidden) from 409 (already
applied), and offline replay depends on 409. See
[10-reuse-from-references.md](10-reuse-from-references.md).

## 4. Folder documentation

Each significant folder gets a short `AGENT.md`:

- what this area does
- read order
- key files
- conventions
- when to update this file

Pattern borrowed from `examples/old-commissire`. The goal: understand an area by
reading its folder, not the whole repo.

## 5. Page-level documentation

Every page or major view carries a short note covering: what it is for, its route,
what data it loads, what actions it supports, what state it owns, and which API it
calls.

This makes instructions like *"fix the live map page"* or *"simplify the rider
panel on the Live page"* actionable without reading the whole app.

## 6. UI instructions target a screen

Good: *"On the Live Event page, keep only name, status and last known location in
the rider panel."*
Not: *"change the components folder."*

---

## 7. Testing

### Rules catalog

Every behavioural rule gets a **stable ID**, and the ID is the test name:

```
RULE-LOC-02  participant_last_location updates only when the incoming point
             is newer than the stored one.
```

Write the rule when you write the behaviour. If the code changes, update the rule.
Pattern from `examples/old-commissire/docs/app-rules.md`. Full list of what must be
covered: [09-nfr-privacy-testing.md](09-nfr-privacy-testing.md).

### Before any change is done

```bash
cd server-podium
npm test          # vitest
npm run typecheck
npm run lint      # biome
```

All three clean. No exceptions.

### Manual checks that cannot be automated here

The Android app is not in this repo. After **any** change to auth or location
ingest, verify by hand:

1. the real app joins an event by code
2. it transmits and points land with the correct `recorded_at`
3. airplane mode for two minutes mid-ride — on reconnect the queued points arrive
   with their **original** timestamps
4. SOS sets `emergency = true`

Check 3 is the one that catches timestamp regressions.

---

## 8. Bug-fix workflow

1. identify the page or feature area
2. read that folder's `AGENT.md`
3. find the exact files
4. fix the root cause
5. add or update the rule and its test
6. update the page documentation if behaviour changed

## 9. Documentation standards

Docs must be short, direct and maintainable. Each should answer: what this area
does, where it fits, which files matter, what is intentionally excluded, and what
comes next.

Keep [03-progress.md](03-progress.md) and [01-task-list.md](01-task-list.md)
current — they are how work resumes after a break.

## 10. Final rule

The project should be understandable by reading the relevant folder and the exact
page or feature file — not by reading every file in the repo.
