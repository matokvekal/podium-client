/**
 * Profile setup page
 *
 * Route:    /account/setup
 * Loads:    nothing — the profile is already in AuthContext
 * Actions:  save first name, last name, nickname and (optionally) an emergency phone
 * State:    the form fields and the save error
 * Calls:    PATCH /users/me
 *
 * Shown once, straight after a first sign-in: the server reports requiresProfile until
 * first name, last name and nickname are all set, and every other screen is gated behind
 * it. The emergency phone is deliberately optional — it is collected for a future SOS
 * feature and is not displayed anywhere in v1.
 */

import { type FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../lib/api-client";
import { detectDefaultCountryCode, flagEmoji, orderedCountries } from "../lib/countries";
import { useCountryStore } from "../store/countryStore";
import { useUserModeStore } from "../store/userModeStore";

export function ProfileSetupPage() {
  const { profile, updateProfile } = useAuth();
  const navigate = useNavigate();
  // Where this rider was actually headed before setup interrupted them (RequireAuth in
  // App.tsx puts it here). A /join/:code link is the case that matters: sending them home
  // instead loses the invite.
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [firstName, setFirstName] = useState(profile?.firstName ?? "");
  const [lastName, setLastName] = useState(profile?.lastName ?? "");
  const [nickname, setNickname] = useState(profile?.nickname ?? "");
  const [emergencyPhone, setEmergencyPhone] = useState(profile?.emergencyPhone ?? "");
  // The country goes to the server now (users.country, sql/030-country.sql). The starting
  // value, computed once on mount:
  //   1. the country the server already has for this rider   — a real value, never overridden
  //   2. a country still sitting in the on-device store       — a pre-server pick, migrated up
  //   3. the device/browser locale region                     — he-IL -> Israel, en-US -> US
  //   4. Israel                                                — the app fallback
  const savedCountry = useCountryStore((state) => state.code);
  const [defaultCountry] = useState(
    () => profile?.country ?? savedCountry ?? detectDefaultCountryCode(),
  );
  const [country, setCountry] = useState(defaultCountry);
  // Client-only UI preference (store/userModeStore.ts) — NOT part of the profile sent to the
  // server. Unchecked by default: a new user is a rider unless they say otherwise.
  const [organizes, setOrganizes] = useState(false);
  const setUserMode = useUserModeStore((state) => state.setMode);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await updateProfile({
        firstName,
        lastName,
        nickname,
        ...(emergencyPhone ? { emergencyPhone } : {}),
        ...(country ? { country } : {}),
      });
      // countryStore is reconciled from the server response by AuthContext now — nothing to
      // write here.
      setUserMode(organizes ? "organizer" : "rider");
      navigate(from && from !== "/account/setup" ? from : "/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack" style={{ maxWidth: "26rem" }}>
      <h1>Tell us who you are</h1>
      <p className="muted">This is how you appear to organizers and on the rider list.</p>

      {error && (
        <p className="banner banner--error" role="alert">
          {error}
        </p>
      )}

      <form className="card stack" onSubmit={save}>
        <label htmlFor="firstName">First name</label>
        <input
          id="firstName"
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          autoComplete="given-name"
          required
        />

        <label htmlFor="lastName">Last name</label>
        <input
          id="lastName"
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
          autoComplete="family-name"
          required
        />

        <label htmlFor="nickname">Nickname</label>
        <input
          id="nickname"
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          autoComplete="nickname"
          required
        />

        <label htmlFor="emergencyPhone">Emergency phone (optional)</label>
        <input
          id="emergencyPhone"
          type="tel"
          inputMode="tel"
          value={emergencyPhone}
          onChange={(event) => setEmergencyPhone(event.target.value)}
          autoComplete="tel"
        />
        <p className="muted">
          Kept for a future emergency feature. It is not shown to anyone in this version.
        </p>

        <label htmlFor="country">Country</label>
        <select
          id="country"
          value={country}
          onChange={(event) => setCountry(event.target.value)}
          autoComplete="country"
          required
        >
          {orderedCountries(defaultCountry).map((c) => (
            <option key={c.code} value={c.code}>
              {flagEmoji(c.code)} {c.name}
            </option>
          ))}
        </select>
        <p className="muted">Used to show you rides near you first. You can change this later.</p>

        <label className="row" style={{ gap: "var(--space-2)", alignItems: "flex-start" }}>
          <input
            type="checkbox"
            checked={organizes}
            onChange={(event) => setOrganizes(event.target.checked)}
          />
          <span>
            I also organize events
            <br />
            <span className="muted">
              Adds the tools to create and manage rides. You can switch this off any time in the
              menu.
            </span>
          </span>
        </label>

        <button className="button" type="submit" disabled={busy || !country}>
          Save and continue
        </button>
      </form>
    </section>
  );
}
