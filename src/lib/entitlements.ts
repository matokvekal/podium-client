import type { Profile } from "../auth/AuthContext";
import { FALLBACK_LIMITS } from "./plan-limits";

/**
 * The per-user entitlement limits to render/UX-gate against. Reads them from the profile the
 * server sent (GET /users/me → `entitlements`); falls back to FALLBACK_LIMITS only when the
 * server response is unavailable (a cached v1 profile, an offline cold start). Client
 * validation is UX only — the server enforces the real limits and returns a 409 when hit.
 */
export function effectiveLimits(profile: Pick<Profile, "entitlements"> | null | undefined) {
  return profile?.entitlements ?? FALLBACK_LIMITS;
}
