/**
 * Who sees Ride Studio: every signed-in organizer, by default. "Off" always means the original
 * New Ride button, byte for byte.
 *
 * Nothing needs to be switched on. Checked in this order:
 *
 *   1. not signed in, or `canOrganize === false`        -> no (the same permission as the
 *      original form, which the server enforces too);
 *   2. the emergency switch, `/ride-studio-config.json`
 *      saying `{"enabled": false}` (runtime-config.ts)    -> no, for everyone, no redeploy;
 *   3. build-time VITE_RIDE_STUDIO="off"                  -> no (a build without the studio);
 *   4. `localStorage["podium.rideStudioFlag"]` = "off"    -> no (one browser's own opt-out);
 *   5. otherwise                                          -> yes.
 *
 * (`localStorage` = "on" is still honoured, but is no longer needed.)
 */
import { getRuntimeSwitch, useRuntimeSwitch } from "./runtime-config";

export const RIDE_STUDIO_OVERRIDE_KEY = "podium.rideStudioFlag";
export const RIDE_CREATE_METHOD_KEY = "podium.rideCreateMethod";

export interface StudioFlagInput {
  userId: number | null | undefined;
  canOrganize: boolean | undefined;
}

export interface StudioFlagEnv {
  /** The emergency switch from /ride-studio-config.json: false = off for everyone. */
  killSwitch?: boolean;
  /** VITE_RIDE_STUDIO ("off" builds the app without the studio). */
  build?: string;
  /** The stored override, already read. */
  override?: string | null;
}

export function isRideStudioEnabled(
  input: StudioFlagInput,
  env: StudioFlagEnv = readEnv(),
): boolean {
  if (input.userId == null) return false;
  if (input.canOrganize === false) return false;
  if (env.killSwitch === false) return false;
  if (env.build === "off") return false;
  if (env.override === "off") return false;
  return true;
}

function readEnv(): StudioFlagEnv {
  const meta = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  let override: string | null = null;
  try {
    override = globalThis.localStorage?.getItem(RIDE_STUDIO_OVERRIDE_KEY) ?? null;
  } catch {
    override = null;
  }
  return { build: meta.VITE_RIDE_STUDIO, override, killSwitch: getRuntimeSwitch().enabled };
}

/** The same decision as React state: re-evaluated when the emergency-switch file has been read. */
export function useRideStudioEnabled(input: StudioFlagInput): boolean {
  const runtime = useRuntimeSwitch();
  return isRideStudioEnabled(input, { ...readEnv(), killSwitch: runtime.enabled });
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
