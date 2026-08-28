/** Used ONLY when the server's entitlement response is unavailable (offline cold start).
 *  The server is the source of truth — see src/lib/entitlements.ts. */
export const FALLBACK_LIMITS = {
  maxEventsPerWeek: 3,
  maxParticipantsPerEvent: 50,
  maxGroupsPerEvent: 2,
} as const;
