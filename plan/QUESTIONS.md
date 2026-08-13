# Open questions

Things I could not decide or could not do alone. Each one says what I assumed, so work
continued rather than stopping — but the assumption may be wrong, and a few of them are
blockers.

Answer inline under each question. Newest section at the top.

**Written:** 2026-08-13, after the Prisma removal and the client scaffold.

---

## Blockers

### 1. Nothing has been installed, so nothing has been verified ⚠

`server-podium/node_modules` does not exist and neither does the client's, and I was asked
not to use the internet. So `npm install` never ran, and **`npm test`, `npm run typecheck`
and `npm run lint` have not been run against any of this work.** The code is written and
reviewed by reading, not by executing.

`pg` and `@types/pg` are now in `server-podium/package.json`, and the whole client
`package.json` is new — all of it needs installing.

**What I need:** permission to run, or for you to run:

```bash
cd server-podium && npm install && npm test && npm run typecheck && npm run lint
cd ../client-podium && npm install && npm run typecheck && npm run lint
```

`server-podium/package-lock.json` is now stale — it still lists Prisma and has never seen
`pg`. `npm install` rewrites it; do not edit it by hand. The client has no lockfile yet, so
its first install writes one.

Expect small compile errors on the first run — that is normal for a conversion this size
and they are quick to fix. Nothing should be deployed before this passes.

### 2. The database has not been touched ⚠

`sql/900-timestamptz-migration.sql` is written but **not run**. Neither are 002–007. Every
timestamp in the live database is still `TIMESTAMP(3)` with no timezone.

The migration rewrites existing data, and getting it wrong shifts every stored time by
hours with no error. `sql/900` explains exactly how to run it safely.

**What I need:**

1. a confirmed backup (`pg_dump -Fc`)
2. either credentials, or you running the scripts yourself with me watching the output
3. the step-7 check with the **real Android app** afterwards: join, transmit, airplane
   mode for two minutes mid-ride, confirm the queued points arrive with their *original*
   timestamps

Until that runs, the server code and the live schema disagree in one specific way: the code
now sends `recorded_at` as `timestamptz`. The pool pins every connection to `timezone=UTC`,
so the assignment into the old `TIMESTAMP(3)` column still stores UTC exactly as Prisma
did — but this is the one place I want the real app to confirm rather than reasoning about.

### 3. Was `serviceAccountKey.json` actually revoked?

Still listed as open in [03-progress.md](03-progress.md). It is a **Firebase Admin SDK**
key that was committed to git history. The code no longer uses it, so revoking breaks
nothing — but if it is still live in Google Cloud, it is still valid for whoever has it.

**What I need:** a yes or no.

---

## Decisions I made so work could continue

Each of these is easy to change if you disagree — say so and I will.

### 4. The CI workflow is not in this folder

`server-podium/README.md` describes `.github/workflows/node.js.yml`, which runs
`prisma generate` on deploy. That file is not here — it was left behind when the server was
flattened into this repo. **That step must be removed or the deploy will fail**, since
there is no Prisma to generate.

I noted it in the README. **Where does that workflow actually live now?**

### 5. `tsconfig.json` was missing entirely

`package.json` referenced it but no file existed, so `npm run build` and `npm run typecheck`
could not have worked. I wrote:

- `tsconfig.json` — typechecks `src` and `tests`, emits nothing
- `tsconfig.build.json` — emits `src` into `dist/`, so `node dist/server.js` still works

Target ES2023, `module: NodeNext`, strict. **Was there a previous tsconfig with different
settings that the production build depends on?** Also: the server pins
`typescript: ^7.0.2` while I gave the client `^5.9.3` — deliberate, or should both be on 7?

### 6. Google sign-in for the web app

The PWA needs its own OAuth **Web application** client id (`VITE_GOOGLE_CLIENT_ID`), and
the server's `GOOGLE_CLIENT_IDS` must include it. The Android app's id will not work for a
browser.

**What I need:** the web client id, or confirmation that one has to be created. The server
also needs `CORS_ORIGINS` to include the client's origin — I set the example to
`http://localhost:5173` (Vite's default). What is the production origin?

### 7. Rate limit on the location endpoint

Now keyed on `req.auth.userId` instead of the IP, which was the actual fix — carrier NAT
made a whole peloton look like one client. I set **120 requests per 15 minutes per rider**:
generous for a 30-second transmit interval, with room for a burst after a dead zone.

**I could not check the app's real transmit interval** — the transmitter's
`REQUIREMENTS.md` is referenced in the server code but is not in this repo. If the app
uploads more often than every ~7 seconds sustained, this number is too low.

**What I need:** the transmitter's requirements doc, or just the batch interval.

### 8. App icons do not exist

`public/manifest.webmanifest` points at `/icons/icon-192.png`, `/icons/icon-512.png` and
`/icons/icon-512-maskable.png`. I cannot produce PNGs, so **those three files are missing**
and the PWA will not install cleanly until they exist. There is a placeholder `favicon.svg`
that works in the browser tab.

**What I need:** a logo, or permission to generate something plain.

### 9. `GET /api/v1/users/me` — added

The web app has a stored session on a cold start but knows nothing about the rider, and
only `PATCH /users/me` existed. I added the GET. It is additive, so the frozen contract is
untouched and the Android app is unaffected.

### 10. Refresh tokens are in `localStorage`

The alternative is an httpOnly cookie, which would mean same-site hosting and credentialed
CORS. Given a cross-origin API and a PWA that must work after a cold start with no network,
`localStorage` is the pragmatic choice. The exposure is XSS; the mitigation is the
15-minute access token and rotation on every refresh.

**Worth revisiting if the API ever moves behind the same domain as the app.**

### 11. Small documentation bug I corrected

[02-database-schema.md](02-database-schema.md) has
`CREATE INDEX idx_events_status_start ON events (status, start_time)`, but the column is
`starts_at`. I used `starts_at` in `sql/002-events-podium.sql`.

---

## Not blocking, but worth an answer when you have one

- **Who creates events until milestone 2 exists?** There is no create endpoint yet. For
  testing there is `sql/seed.sql` with two example events.
- **`participant_last_location` and `location_points.event_id`** are written into the SQL
  but the server does not populate them yet — that is milestone 6 and milestone 2. Running
  002 early is harmless; the columns simply stay empty.
- **`LOCATION_RETENTION_DAYS`** is now read from the environment (default 30), but nothing
  deletes anything yet. The cleanup job is milestone 7, and it must refuse to run for an
  event whose `participant_tracks` have not been written.
