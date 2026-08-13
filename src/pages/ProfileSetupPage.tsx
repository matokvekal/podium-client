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
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../lib/api-client";

export function ProfileSetupPage() {
  const { profile, updateProfile } = useAuth();
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState(profile?.firstName ?? "");
  const [lastName, setLastName] = useState(profile?.lastName ?? "");
  const [nickname, setNickname] = useState(profile?.nickname ?? "");
  const [emergencyPhone, setEmergencyPhone] = useState(profile?.emergencyPhone ?? "");
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
      });
      navigate("/", { replace: true });
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

        <button className="button" type="submit" disabled={busy}>
          Save and continue
        </button>
      </form>
    </section>
  );
}
