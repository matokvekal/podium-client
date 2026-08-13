# Authentication and JWT

**This is already built and running.** It is described here so the rest of the
system can rely on it, not as a design to be implemented.

Code: `server-podium/src/modules/auth/`.
Endpoint reference: [07-api-contract.md](07-api-contract.md) Part 1 — **frozen**.

---

## The model in one sentence

Google and SMS only answer *"who is this person"*; after a successful provider
check the server issues **its own** tokens, and every other route accepts only
those — never a Google ID token, never an OTP code.

```text
Client (PWA or Android)
    -> Google Sign-In  or  SMS OTP
    -> POST /api/v1/auth/google   { idToken }
       POST /api/v1/auth/sms/verify { challengeId, code }

Server
    -> verify with the provider
    -> find or create the local user
    -> issue accessToken + refreshToken

Client
    -> Authorization: Bearer <accessToken>   on every other call
    -> POST /api/v1/auth/refresh when it expires
```

---

## Two providers

| Provider | Flow |
|---|---|
| **Google** | Client obtains a Google ID token, posts it. Server verifies against `GOOGLE_CLIENT_IDS` (issuer, audience, expiry, signature). |
| **SMS OTP** | `POST /auth/sms/request { phone }` → `{ challengeId }`. Code delivered only by the SMS provider, never in the response. `POST /auth/sms/verify { challengeId, code }`. |

`GET /auth/config` returns which providers are enabled (`AUTH_PROVIDERS`). Clients
call it before rendering the login screen and show only what comes back. A
disabled provider returns `403 AUTH_PROVIDER_DISABLED` — deliberately not 404,
since the code is still there and only exposure is toggled.

OTP challenges are hashed at rest, attempt-limited (default 5), expiring, and
rate-limited (10 requests / 15 min, 30 verifies / 15 min).

Identity lives in `auth_identities`, not on `users` — one row per provider login,
unique on `(provider, provider_user_id)`. A user can therefore hold both a Google
and an SMS identity.

---

## Tokens

| Token | Form | Default life | Storage |
|---|---|---|---|
| Access | JWT | **15 min** (`JWT_ACCESS_EXPIRES_IN`) | client only |
| Refresh | opaque random value, **not a JWT** | **30 days** (`JWT_REFRESH_EXPIRES_IN`) | server stores `sha256()` only |

The refresh token is not a JWT on purpose — there is no `JWT_REFRESH_SECRET`.
It is a random value looked up by hash in `sessions.refresh_token_hash`.

**Rotation.** Every successful refresh issues a new refresh token and overwrites
the stored hash. A token that was already rotated no longer matches any session
and is rejected — so a stolen, already-used refresh token is worthless.

`requireAuth` verifies the access token **statelessly** — signature and expiry
only, no database or network call. It sets `req.auth = { userId, role, sessionId }`.

### Session control

- `POST /auth/logout` — revokes that one session
- `POST /auth/logout-all` — revokes every session for the user, all devices
- a deactivated user (`users.is_active = false`) is rejected at sign-in **and** at
  refresh
- revoking does not kill an already-issued access token; it expires on its own
  within 15 minutes. That is the accepted trade-off of stateless verification

---

## Token lifetime and the offline requirement

A 15-minute access token in an app used far from cell coverage needs care, but the
design already handles it:

- **The Android transmitter** queues GPS locally and uploads in batches when it
  reconnects. It refreshes its access token at the same moment. A rider offline
  for four hours is fine — the 30-day refresh token is still valid on reconnect.
- **The PWA** must treat a failed refresh while offline as *"stay signed in, keep
  working from cache, retry on reconnect"* — **not** as a logout. Forcing an
  organizer to re-login mid-event because a tunnel dropped the signal would be a
  serious failure.

**Rule: never clear the session because a refresh failed with a network error.**
Only clear it on an explicit 401 from a reachable server.

---

## Roles — two different things

| | Where | Meaning |
|---|---|---|
| **Account role** | `users.role` — `RIDER`, `COMMISSAIRE` | global account flag |
| **Event role** | `event_members.role` — `owner`, `operator`, `viewer` | what you may do **on one event** |

Permission checks for events use `event_members`. Do not overload `users.role`
for per-event decisions — a person may own one ride and merely watch another.

New users always get `RIDER`. There is no client-controlled path to
`COMMISSAIRE`; promote by editing the database until a real admin flow exists.

---

## Client behaviour

- store the access token in memory, the refresh token in persistent storage so a
  reload does not force a re-login
- attach `Authorization: Bearer` to every protected request
- on 401, refresh once and retry; if the refresh itself 401s, sign out
- on a **network error**, do not sign out — queue and retry
- clear both tokens on explicit logout

---

## Security notes

- secrets come from env vars; startup **fails fast** on a missing or short
  `JWT_ACCESS_SECRET` in production
- CORS is an explicit allowlist (`CORS_ORIGINS`), never `*`
- `trust proxy` is exactly 1 hop — the nginx proxy — so rate limiting can read
  `X-Forwarded-For` without clients spoofing it
- raw Google ID tokens are never stored
- refresh tokens are never stored in plaintext

⚠️ **Open item:** `server-podium/README.md` records that a `serviceAccountKey.json`
was committed to git history and should be rotated or revoked in Google Cloud
Console. The code no longer uses it, but if the key is still live it is still
valid. **Confirm this was done.**

---

## What is deliberately not built

- password login — the `EMAIL_PASSWORD` provider type exists in the schema but no
  flow implements it
- multi-service auth, session stores, Redis — not needed at this scale
- email verification beyond what Google already does
