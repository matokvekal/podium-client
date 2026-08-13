/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Podium API, including /api/v1. */
  readonly VITE_API_URL?: string;
  /** Map tile template. The one setting that could ever cost money — see lib/config.ts. */
  readonly VITE_TILE_URL?: string;
  /** Attribution shown on the map. Required by the tile provider's terms. */
  readonly VITE_TILE_ATTRIBUTION?: string;
  /** Google OAuth client id used by the sign-in button. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** App version, baked in from package.json at build time by vite.config.ts. */
declare const __APP_VERSION__: string;
