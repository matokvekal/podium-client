// WIND FORECAST PILOT GATE — the one place that says who gets the wind strip.
//
// Two conditions, BOTH required:
//   1. the feature is enabled for this account — `profile.canSeeWindForecast`, computed by the
//      server (GET /users/me) from ONE switch in user.controller.ts: WIND_FORECAST_EMAILS today
//      (the pilot account only), WIND_FORECAST_FOR_EVERYONE to open it to all. The client holds
//      no email list: the profile does not carry an email, and this way there is nothing to keep
//      in sync. Same shape as canSeeStatistics (app/statisticsPreview.tsx).
//   2. this viewer owns the ride or is a participant in it.
//
// Anyone else: no wind UI, no weather request, nothing stored. Callers pass the result of
// `canSeeWindForecast` to the hook and it does nothing at all when false.
//
// CLIENT-SIDE ONLY. The forecast is public weather data fetched straight from the provider, so
// there is no server route to guard; this decides what a rider is shown. To open the feature up:
// flip WIND_FORECAST_FOR_EVERYONE on the server, then delete condition 1 here if wanted.

interface ProfileGate {
  canSeeWindForecast?: boolean;
}

interface EventGate {
  isOwner?: boolean;
  myParticipant?: { registrationStatus: string } | null;
}

/** Condition 1 — only an explicit `true` counts; an absent field (cached older profile) is "no". */
export function isWindForecastEnabled(profile: ProfileGate | null | undefined): boolean {
  return profile?.canSeeWindForecast === true;
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
): boolean {
  return isWindForecastEnabled(profile) && isOwnerOrParticipant(event);
}
