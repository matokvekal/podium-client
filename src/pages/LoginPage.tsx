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
 * ⚠ Contains a TEMPORARY developer sign-in that bypasses authentication in development
 * builds — POST /auth/dev-login. DELETE IT BEFORE PRODUCTION: see README.md.
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
  const { status, signInWithGoogle, verifySmsCode, signInAsDevUser } = useAuth();
  const location = useLocation();
  const googleButtonRef = useRef<HTMLDivElement>(null);

  const [providers, setProviders] = useState<Provider[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // ⚠ TEMPORARY — delete with the rest of the dev sign-in (see README.md).
  const [serverDevLogin, setServerDevLogin] = useState(false);

  const [phone, setPhone] = useState("");
  const [challengeId, setChallengeId] = useState<number | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    apiRequest<AuthConfig>("/auth/config", { anonymous: true })
      .then((authConfig) => {
        setProviders(authConfig.providers);
        setServerDevLogin(authConfig.devLogin === true);
      })
      .catch(() => setError("Could not reach the server. Check your connection and try again."));
  }, []);

  useEffect(() => {
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

  // ⚠⚠ TEMPORARY DEVELOPMENT AID — DELETE BEFORE PRODUCTION (see README.md).
  async function devSignIn(role: "COMMISSAIRE" | "RIDER") {
    setBusy(true);
    setError(null);
    try {
      await signInAsDevUser(role);
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
      <h1>Bike Podium</h1>
      <p className="muted">
        Create a ride or a race, join with a code, and follow every rider live on the map.
      </p>

      {error && (
        <p className="banner banner--error" role="alert">
          {error}
        </p>
      )}

      {providers.includes("GOOGLE") && (
        <section className="card stack">
          <h2>Continue with Google</h2>
          <div ref={googleButtonRef} />
        </section>
      )}

      {providers.includes("SMS") && (
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

      {/*
        ⚠⚠⚠ TEMPORARY DEVELOPMENT AID — DELETE THIS BLOCK BEFORE PRODUCTION ⚠⚠⚠
        Skips authentication entirely and signs in as a fake user. Two independent switches
        have to agree before it renders: config.devLoginEnabled is false in any production
        build (so this is compiled out, not merely hidden), and the server must report
        devLogin: true from /auth/config. Removal checklist: README.md > Developer sign-in.
      */}
      {config.devLoginEnabled && serverDevLogin && (
        <section
          className="card stack"
          style={{ borderColor: "#b45309", borderStyle: "dashed", borderWidth: 2 }}
        >
          <h2 style={{ color: "#b45309" }}>⚠ Developer sign-in</h2>
          <p className="muted">
            Bypasses login with a fake account. Development builds only — never reaches production.
          </p>
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={() => devSignIn("COMMISSAIRE")}
          >
            Sign in as dev commissaire
          </button>
          <button
            className="button button--quiet"
            type="button"
            disabled={busy}
            onClick={() => devSignIn("RIDER")}
          >
            Sign in as dev rider
          </button>
        </section>
      )}

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
