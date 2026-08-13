# Prisma Removal + Timestamp Migration

**This is the next piece of work.** Do it before adding any new feature — every
new module written against Prisma is more to convert later.

## Why

The project brief states twice:

> Do NOT use Prisma or any ORM.
> I will create the database/schema myself later. For now, provide the required
> PostgreSQL SQL scripts.

The existing server uses Prisma throughout. The two cannot both stand, and the
brief wins. There is also a practical reason: Prisma wants to **own** the schema
through its migration system, which directly conflicts with hand-owning the SQL.

## Scope

**32 Prisma call sites across 11 files:**

```
src/db/prisma.ts
src/lib/jwt.ts
src/middleware/requireAuth.ts
src/modules/auth/auth.service.ts
src/modules/auth/session.service.ts
src/modules/auth/token.service.ts
src/modules/events/event.service.ts
src/modules/sms/otp.service.ts
src/modules/users/user.controller.ts
src/modules/users/user.service.ts
src/server.ts
```

Plus `tests/support/fake-prisma.ts`, `prisma/schema.prisma`, `prisma/seed.ts`,
`prisma/migrations/`, and the `db:*` scripts in `package.json`.

The Prisma calls in use are simple — `findFirst`, `findMany`, `findUnique`,
`create`, `createMany`, `update`, `upsert`. There is no Prisma-specific cleverness
to unwind.

**The auth logic itself does not change.** Only how it reaches the database.

Estimated 1–2 days including the test harness.

---

## Step 1 — Add the database layer

`npm install pg` / `npm install -D @types/pg`, then:

```ts
// src/db/pool.ts
import { Pool } from "pg";
import { env } from "../config/env.js";

export const pool = new Pool({ connectionString: env.DATABASE_URL });

export async function query<T>(text: string, params?: unknown[]): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

export async function queryOne<T>(text: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function withTransaction<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
```

Always use bind parameters (`$1`, `$2`). Never build SQL by string concatenation.

## Step 2 — One query file per module

Follow the shape the existing example server uses: **no SQL in controllers.**

```
src/modules/auth/auth.queries.ts
src/modules/users/user.queries.ts
src/modules/events/event.queries.ts
src/modules/sms/otp.queries.ts
```

Services call the query file; controllers call services. Row types are declared
explicitly since there is no generated client any more:

```ts
export interface UserRow {
  id: number;
  first_name: string | null;
  // ...
}
```

**Column naming.** The database is `snake_case`; the API is `camelCase`. Map at
the query-file boundary — one small `mapUser(row)` per table — so the rest of the
code never sees snake_case and the frozen API responses stay byte-identical.

## Step 3 — Convert call sites, module by module

Order, easiest and most isolated first:

1. `otp.service.ts` — self-contained, well tested
2. `session.service.ts` + `token.service.ts` — the refresh-rotation logic
3. `user.service.ts` + `user.controller.ts`
4. `auth.service.ts`
5. `event.service.ts`
6. `requireAuth.ts`, `jwt.ts`, `server.ts` — remove the client import and swap the
   shutdown hook to `pool.end()`

Run `npm test` after each module. The tests are the safety net for exactly this
kind of change — do not batch all six and hope.

Translation reference:

| Prisma | SQL |
|---|---|
| `findFirst({ where: { code, isActive: true } })` | `SELECT … WHERE code = $1 AND is_active = TRUE LIMIT 1` |
| `findUnique({ where: { id } })` | `SELECT … WHERE id = $1` |
| `createMany({ data })` | multi-row `INSERT … VALUES`, or `UNNEST` for large batches |
| `upsert({ where, create, update })` | `INSERT … ON CONFLICT (…) DO UPDATE SET …` |
| `update({ where, data })` | `UPDATE … SET … WHERE … RETURNING *` |

`saveLocationBatch` is the one worth writing carefully — it inserts up to 200 rows
per call. Use a single multi-row insert, not 200 statements.

## Step 4 — Replace the test harness

`tests/support/fake-prisma.ts` becomes a fake pool exposing `query()`. The test
*assertions* should not change — if a test needs rewriting beyond its setup, that
is a signal the behaviour changed and something is wrong.

## Step 5 — Take ownership of the SQL

Create `server-podium/sql/` with hand-written, hand-run scripts:

```
sql/001-init.sql            the current tables, as TIMESTAMPTZ
sql/002-events-podium.sql   owner, visibility, status, display_mode
sql/003-participants.sql    nullable user_id, name/email/phone, 3 status axes, results
sql/004-routes.sql          routes + event_routes
sql/005-tracking.sql        participant_last_location + participant_tracks
sql/006-client-actions.sql  offline de-duplication
```

Then delete `prisma/`, drop `@prisma/client` and `prisma` from `package.json`, and
remove the `db:generate` / `db:migrate` / `db:seed` scripts. Keep `prisma/seed.ts`
logic as `sql/seed.sql` or a small `scripts/seed.ts` if it is still useful.

Full DDL: [02-database-schema.md](02-database-schema.md).

---

## Step 6 — The timestamp migration ⚠️ the only risky step

Every timestamp column is currently `TIMESTAMP(3)` — **no timezone**. Prisma's
default. For a system where riders upload hours-old GPS points from the road, this
is a real bug, not a style issue.

Prisma stores UTC, so the conversion must say so **explicitly**:

```sql
ALTER TABLE location_points
  ALTER COLUMN recorded_at TYPE TIMESTAMPTZ USING recorded_at AT TIME ZONE 'UTC',
  ALTER COLUMN received_at TYPE TIMESTAMPTZ USING received_at AT TIME ZONE 'UTC';
```

**If `AT TIME ZONE 'UTC'` is omitted, PostgreSQL assumes the server's local
timezone and every existing timestamp silently shifts by several hours.** There is
no error and no warning.

Apply the same treatment to every timestamp column in `users`, `auth_identities`,
`sessions`, `events`, `event_participants`, `location_points`, `otp_challenges`.

**Before running it**

1. Back up the database
2. Note the exact value of a few known rows
3. Run the migration
4. Check those same rows still read the same instant

---

## Step 7 — The checkpoint that matters

After the migration is deployed, verify with the **real Android app**, not curl:

1. Open the transmitter, scan or type an event code
2. Join the event
3. Transmit for a minute
4. Confirm rows land in `location_points` with a correct `recorded_at`
5. Turn airplane mode on for two minutes, keep riding, turn it off
6. Confirm the queued points arrive with their **original** timestamps, not the
   upload time

If step 6 passes, the foundation is sound and everything after this is additive.

---

## Two fixes to do in the same pass

**Rate limiting on the location endpoint.** The global limit is 300 requests per
15 minutes **per IP**. Riders on mobile networks share carrier NAT addresses, so
at a large event many real riders look like one IP and get throttled. Give
`POST /events/:eventId/locations/batch` its own limiter keyed on
`req.auth.userId`.

**The exposed credential.** `server-podium/README.md` records that
`serviceAccountKey.json` was committed to git history and *"should still be
rotated/revoked in Google Cloud Console"*. The code no longer uses it, but if the
key is still live in Google Cloud it is still valid. **Confirm this was actually
done.**

---

## Definition of done

- [ ] no `@prisma/client` import anywhere in `src/`
- [ ] `prisma/` deleted, dependencies and `db:*` scripts removed
- [ ] `sql/` holds hand-written, hand-run scripts
- [ ] every timestamp column is `TIMESTAMPTZ`, verified against known rows
- [ ] `npm test` green, `npm run typecheck` clean, `npm run lint` clean
- [ ] the real Android app joins and transmits successfully
- [ ] an offline batch arrives with original timestamps preserved
- [ ] location endpoint rate-limited per user, not per IP
- [ ] the exposed Google credential confirmed revoked
