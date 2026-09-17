// Which country the Country dropdown on EventCreatePage lands on for a NEW ride.
//
// Asked for directly: "the default country at the create page has to be the default [country]
// and if he already created rides at some country that country will have to be the default
// also". So there are two rules, in that order of authority:
//
//   1. WHERE THIS ORGANISER ACTUALLY PUTS RIDES — the country of the rides they have already
//      created. Someone who has run eleven rides in Sweden is organising the twelfth in Sweden,
//      whatever their profile or their phone's time zone says.
//   2. THEIR OWN COUNTRY — users.country (sql/030-country.sql), the profile field, which is
//      what the form used before this and stays the answer for an organiser with no rides yet.
//
// ...then the device guess (time zone, then locale) as the last resort, which is all a brand
// new account has.
//
// EVIDENCE, NOT RECENCY, for rule 1. The pick is the country the organiser has created the MOST
// rides in, ties broken by the latest start date. One ride abroad does not move the default for
// an organiser whose other nine are at home — that single trip would otherwise re-stamp every
// later ride with the wrong country, and events.country is what Find Rides filters on, so a
// wrong default is what puts a ride in front of the wrong riders. Note `startsAt` is the only
// time the summary carries (there is no createdAt on EventSummary), which is why it is the
// tie-break rather than the primary key.
//
// Everything is filtered through isKnownCountryCode: events.country is a free CHAR(2) with no
// server-side allow-list, and a code this build's list does not contain would leave the <select>
// with a value matching no <option> — a picker showing nothing, worse than a wrong guess.
//
// Pure and store-free on purpose: the caller passes the rides, the remembered pick and the
// profile, so the whole rule is testable without React, zustand or IndexedDB.

import { detectDefaultCountryCode, isKnownCountryCode } from "./countries";

/** The little of an event this rule reads — any EventSummary satisfies it. */
export interface RideCountrySource {
  country?: string | null;
  startsAt?: string | null;
}

function startTime(ride: RideCountrySource): number {
  const parsed = ride.startsAt ? Date.parse(ride.startsAt) : Number.NaN;
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

/**
 * The country these rides say the organiser rides in — most rides wins, latest start breaks a
 * tie — or null when none of them carries a country this build knows.
 *
 * Pass ONLY rides the organiser created. A ride they merely joined says where someone else
 * organises, and letting those vote would hand a rider's default to whoever they ride with.
 */
export function countryFromOwnRides(rides: readonly RideCountrySource[]): string | null {
  const counts = new Map<string, { rides: number; latest: number }>();
  for (const ride of rides) {
    const code = ride.country;
    if (!isKnownCountryCode(code)) continue;
    const seen = counts.get(code);
    const at = startTime(ride);
    if (seen) {
      seen.rides += 1;
      seen.latest = Math.max(seen.latest, at);
    } else {
      counts.set(code, { rides: 1, latest: at });
    }
  }

  let best: string | null = null;
  let bestTally = { rides: 0, latest: Number.NEGATIVE_INFINITY };
  for (const [code, tally] of counts) {
    if (
      tally.rides > bestTally.rides ||
      (tally.rides === bestTally.rides && tally.latest > bestTally.latest)
    ) {
      best = code;
      bestTally = tally;
    }
  }
  return best;
}

export interface DefaultRideCountryInput {
  /** Rides this organiser CREATED (not ones they joined). */
  ownRides?: readonly RideCountrySource[];
  /**
   * The country of the last ride created ON THIS DEVICE
   * (store/lastEventDefaultsStore.ts). Stands in for `ownRides` on the one screen where it
   * matters most — straight after creating a ride, before My Rides has been refetched — and on
   * a cold start where the list has not loaded yet.
   */
  lastUsedCountry?: string | null;
  /** users.country — the organiser's own country from their profile. */
  profileCountry?: string | null;
}

/**
 * The country a NEW ride's form should open on. Always returns a code that is in COUNTRIES, so
 * the caller can hand it straight to the picker.
 *
 * Edit is NOT a caller: an existing ride's own stored country is the only right answer there,
 * and re-deriving it would silently move a Swedish ride home. See EventCreatePage.
 */
export function defaultRideCountry(input: DefaultRideCountryInput): string {
  const fromRides = countryFromOwnRides(input.ownRides ?? []);
  if (fromRides) return fromRides;
  if (isKnownCountryCode(input.lastUsedCountry)) return input.lastUsedCountry;
  if (isKnownCountryCode(input.profileCountry)) return input.profileCountry;
  return detectDefaultCountryCode();
}
