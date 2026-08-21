// Runtime configuration. Everything here comes from VITE_* variables so a build can be
// pointed at a different API or a different tile provider without touching code.

function required(value: string | undefined, name: string, fallback: string): string {
  if (value && value.length > 0) return value;
  if (import.meta.env.PROD) {
    console.warn(`${name} is not set — falling back to ${fallback}`);
  }
  return fallback;
}

export const config = {
  /** Base URL of the Podium API, including /api/v1. */
  apiUrl: required(
    import.meta.env.VITE_API_URL,
    "VITE_API_URL",
    "http://localhost:5000/api/v1",
  ).replace(/\/$/, ""),

  /**
   * Map tiles. The library (Leaflet) and the tiles are separate concerns: this URL is the
   * only part that could ever cost money, and it lives here so swapping OpenStreetMap for
   * Stadia, MapTiler or Thunderforest is a one-line change.
   *
   * Not Google Maps — it needs a billing account and its terms forbid caching tiles, which
   * would rule out offline map work later.
   */
  tileUrl: required(
    import.meta.env.VITE_TILE_URL,
    "VITE_TILE_URL",
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  ),

  /** Attribution is a condition of using the tiles. It must stay visible on the map. */
  tileAttribution: required(
    import.meta.env.VITE_TILE_ATTRIBUTION,
    "VITE_TILE_ATTRIBUTION",
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  ),

  /** Google OAuth client id for sign-in. The server verifies the token against its own list. */
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "",

  /**
   * App version, from package.json via vite.config.ts. Shown on the login screen so a
   * screenshot from a rider is enough to tell which build they are on.
   */
  appVersion: __APP_VERSION__,

  /**
   * ⚠ TEMPORARY: whether to offer the developer sign-in shortcut on the login screen.
   *
   * `import.meta.env.DEV` is false in every production build, so this is compiled out by
   * dead-code elimination rather than merely hidden. The server has the final say — it also
   * has to report `devLogin: true` from /auth/config, and its endpoint 404s otherwise.
   *
   * Delete this along with the server route before production — see README.md.
   */
  devLoginEnabled: import.meta.env.DEV,

  /** How often the live map asks for new positions. 10–15 s: riders move, batteries don't. */
  livePollIntervalMs: 12_000,

  /**
   * How often non-live pages re-pull data that has no push channel behind it (e.g.
   * EventDetailPage's rider count / pending join-request badge) — asked for directly ("we will
   * not use soket so puling can be every 2-3 minutes"). 2.5 min: frequent enough that a new
   * join request shows up without a manual refresh, infrequent enough not to hammer the API
   * for something that isn't time-critical the way live position tracking is.
   */
  backgroundPollIntervalMs: 150_000,

  /** A rider with nothing newer than this is drawn as stale rather than current. */
  staleAfterMs: 90_000,
} as const;
