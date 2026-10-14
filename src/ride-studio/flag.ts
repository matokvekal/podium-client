/**
 * Who sees Ride Studio. Off for everyone unless switched on, and "off" always means the original
 * New Ride button, byte for byte.
 *
 * The app has no server-driven feature-flag mechanism and `Profile` carries no email, so the
 * pilot switch is client-side and explicit, in this order:
 *
 *   1. `localStorage["podium.rideStudioFlag"]` = "off" -> disabled (an organizer's own opt-out,
 *      and the kill switch for tests);
 *   2. `localStorage["podium.rideStudioFlag"]` = "on"  -> enabled (QA / the E2E suite);
 *   3. VITE_RIDE_STUDIO_USER_IDS — a comma-separated list of user ids, set at build time;
 *   4. VITE_RIDE_STUDIO = "all" — everyone who can organize (the later general release).
 *
 * Only users who can organize ever see the entry: Ride Studio creates rides exactly as the
 * original form does, so it is gated by the same permission (and the server enforces it).
 * A server-driven flag (a field on GET /users/me) is the natural next step and needs a server
 * change, which this phase deliberately does not make.
 */

export const RIDE_STUDIO_OVERRIDE_KEY = "podium.rideStudioFlag";
export const RIDE_CREATE_METHOD_KEY = "podium.rideCreateMethod";

export interface StudioFlagInput {
  userId: number | null | undefined;
  canOrganize: boolean | undefined;
}

export interface StudioFlagEnv {
  /** VITE_RIDE_STUDIO_USER_IDS */
  userIds?: string;
  /** VITE_RIDE_STUDIO */
  all?: string;
  /** The stored override, already read. */
  override?: string | null;
}

export function isRideStudioEnabled(
  input: StudioFlagInput,
  env: StudioFlagEnv = readEnv(),
): boolean {
  if (input.userId == null) return false;
  if (input.canOrganize === false) return false;
  if (env.override === "off") return false;
  if (env.override === "on") return true;
  if (env.all === "all") return true;
  const ids = (env.userIds ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(String(input.userId));
}

function readEnv(): StudioFlagEnv {
  const meta = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  let override: string | null = null;
  try {
    override = globalThis.localStorage?.getItem(RIDE_STUDIO_OVERRIDE_KEY) ?? null;
  } catch {
    override = null;
  }
  return { userIds: meta.VITE_RIDE_STUDIO_USER_IDS, all: meta.VITE_RIDE_STUDIO, override };
}

export type CreateMethod = "normal" | "studio";

export function readCreateMethod(storage: Storage | null = safeStorage()): CreateMethod | null {
  try {
    const v = storage?.getItem(RIDE_CREATE_METHOD_KEY);
    return v === "normal" || v === "studio" ? v : null;
  } catch {
    return null;
  }
}

export function writeCreateMethod(
  method: CreateMethod | null,
  storage: Storage | null = safeStorage(),
): void {
  try {
    if (method === null) storage?.removeItem(RIDE_CREATE_METHOD_KEY);
    else storage?.setItem(RIDE_CREATE_METHOD_KEY, method);
  } catch {
    /* a preference that cannot be saved is just asked again */
  }
}

function safeStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
