/**
 * Login page
 *
 * Route:    /login
 * Loads:    GET /auth/config — which sign-in methods this deployment offers
 * Actions:  Google sign-in, SMS code request and verification
 * State:    the chosen method, the SMS challenge id, the current error
 * Calls:    POST /auth/google, POST /auth/sms/request, POST /auth/sms/verify
 *
 * Only the methods /auth/config returns are shown. Google and SMS both answer the same
 * question — who is this person — and both end with the server issuing its own tokens.
 *
 * Also shows the app version (lib/config.ts, from package.json) so a screenshot is enough
 * to tell which build someone is on.
 *
 * ⚠ Contains two TEMPORARY developer sign-ins that bypass authentication in development
 * builds — DELETE BEFORE PRODUCTION, see README.md:
 *   - server-backed: POST /auth/dev-login (needs the server running)
 *   - client-only: signInAsLocalDevUser (no network — works with the server down)
 */

import { type FormEvent, useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { renderGoogleButton } from "../auth/google-signin";
import { ApiError, apiRequest } from "../lib/api-client";
import { config } from "../lib/config";

type Provider = "GOOGLE" | "SMS" | "EMAIL";

interface AuthConfig {
  providers: Provider[];
  /** ⚠ TEMPORARY: server offers the developer sign-in shortcut. Delete before production. */
  devLogin?: boolean;
}

export function LoginPage() {
  const { status, signInWithGoogle, verifySmsCode } = useAuth();
  const location = useLocation();
  const googleButtonRef = useRef<HTMLDivElement>(null);

  const [providers, setProviders] = useState<Provider[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [phone, setPhone] = useState("");
  const [challengeId, setChallengeId] = useState<number | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    apiRequest<AuthConfig>("/auth/config", { anonymous: true })
      .then((authConfig) => setProviders(authConfig.providers))
      .catch(() => setError("Could not reach the server. Check your connection and try again."));
  }, []);

  // SMS sign-in is hidden for now — product decision, not a removal. The provider, the
  // request/verify handlers and the form below are untouched; flip this back to
  // `providers.includes("SMS")` to restore it.
  const smsLoginVisible = false;

  useEffect(() => {
    // devSignInActive un-renders the container, so the ref check below also covers it.
    if (!providers.includes("GOOGLE") || !googleButtonRef.current) return;

    renderGoogleButton(googleButtonRef.current, (idToken) => {
      setBusy(true);
      setError(null);
      signInWithGoogle(idToken)
        .catch((err: unknown) => setError(messageFor(err)))
        .finally(() => setBusy(false));
    }).catch(() => {
      setError("Google sign-in is unavailable right now.");
    });
  }, [providers, signInWithGoogle]);

  if (status === "signed-in") {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== "/login" ? from : "/"} replace />;
  }

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<{ challengeId: number }>("/auth/sms/request", {
        method: "POST",
        body: { phone },
        anonymous: true,
      });
      setChallengeId(result.challengeId);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    if (challengeId === null) return;
    setBusy(true);
    setError(null);
    try {
      await verifySmsCode(challengeId, code);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-main stack" style={{ maxWidth: "26rem" }}>
      <h1>El Niño Move</h1>
      <p className="muted">
        Create a ride or a race, join with a code, and follow every rider live on the map.
      </p>

      {error && (
        <p className="banner banner--error" role="alert">
          {error}
        </p>
      )}

      {/* Dev-login bypass boxes removed from this page directly — Google is now the one login
          box shown here. signInAsLocalDevUser/signInAsDevUser/devSignIn are left in place
          (AuthContext.tsx, api-client) since other test flows may still call them directly;
          only the UI entry point here is gone. A standard email/password login is planned as
          a second option later — see the `Provider` union above, which already has "EMAIL". */}
      {providers.includes("GOOGLE") && (
        <section className="card stack">
          <h2>Continue with Google</h2>
          <div ref={googleButtonRef} />
        </section>
      )}

      {smsLoginVisible && providers.includes("SMS") && (
        <section className="card stack">
          <h2>Continue with your phone</h2>

          {challengeId === null ? (
            <form className="stack" onSubmit={requestCode}>
              <label htmlFor="phone">Phone number</label>
              <input
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+15551234567"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                required
              />
              <p className="muted">
                International format, starting with <code>+</code>.
              </p>
              <button className="button" type="submit" disabled={busy || phone.length < 8}>
                Send me a code
              </button>
            </form>
          ) : (
            <form className="stack" onSubmit={submitCode}>
              <label htmlFor="code">The 6-digit code we sent to {phone}</label>
              <input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
              />
              <button className="button" type="submit" disabled={busy || code.length !== 6}>
                Sign in
              </button>
              <button
                className="button button--quiet"
                type="button"
                onClick={() => {
                  setChallengeId(null);
                  setCode("");
                }}
              >
                Use a different number
              </button>
            </form>
          )}
        </section>
      )}

      {providers.length === 0 && !error && <p className="muted">Loading sign-in options…</p>}

      <p className="muted" style={{ textAlign: "center", fontSize: "0.8rem" }}>
        Version {config.appVersion}
      </p>
    </main>
  );
}

function messageFor(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.isOffline) return "You appear to be offline.";
    if (err.status === 401) return "That code is not right. Try again.";
    if (err.status === 429) return "Too many attempts. Wait a little and try again.";
    return err.message;
  }
  return "Something went wrong. Try again.";
}
