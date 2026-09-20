// WIND FORECAST PILOT GATE — the one place that says who gets the wind strip.
//
// Two conditions, BOTH required:
//   1. the feature is enabled — for EVERYONE while WIND_FORECAST_FOR_EVERYONE (below) is true (it
//      is: the pilot is over). Set it back to false to return to the pilot, where only accounts
//      with `profile.canSeeWindForecast` (computed by the server, GET /users/me, from the
//      WIND_FORECAST_EMAILS list in user.controller.ts) get it. The client holds no email list.
//   2. this viewer owns the ride or is a participant in it.
//
// Anyone else: no wind UI, no weather request, nothing stored. Callers pass the result of
// `canSeeWindForecast` to the hook and it does nothing at all when false.
//
// CLIENT-SIDE ONLY. The forecast is public weather data fetched straight from the provider, so
// there is no server route to guard; this decides what a rider is shown. This one constant is the
// switch: nothing else in the app needs to change to open or close the feature.

/** THE switch. True = every rider who owns or rides an event gets the strip; false = pilot only. */
export const WIND_FORECAST_FOR_EVERYONE = true;

interface ProfileGate {
  canSeeWindForecast?: boolean;
}

interface EventGate {
  isOwner?: boolean;
  myParticipant?: { registrationStatus: string } | null;
}

/**
 * Condition 1 — open to everyone while the switch is on; in pilot mode only an explicit `true`
 * counts, so an absent field (cached older profile) is "no". `everyone` is a parameter only so
 * both modes can be tested; callers use the default.
 */
export function isWindForecastEnabled(
  profile: ProfileGate | null | undefined,
  everyone: boolean = WIND_FORECAST_FOR_EVERYONE,
): boolean {
  return everyone || profile?.canSeeWindForecast === true;
}

/**
 * Condition 2 — the organizer, or a rider who is IN the ride. "registered" (no approval needed)
 * and "approved" count; "waiting_approval" and "rejected" do not, matching the ride page's own
 * isApproved(): a rider who is not yet cleared to ride is not yet riding.
 */
export function isOwnerOrParticipant(event: EventGate | null | undefined): boolean {
  if (!event) return false;
  if (event.isOwner === true) return true;
  const status = event.myParticipant?.registrationStatus;
  return status === "approved" || status === "registered";
}

export function canSeeWindForecast(
  profile: ProfileGate | null | undefined,
  event: EventGate | null | undefined,
  everyone: boolean = WIND_FORECAST_FOR_EVERYONE,
): boolean {
  return isWindForecastEnabled(profile, everyone) && isOwnerOrParticipant(event);
}
