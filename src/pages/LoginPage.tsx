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
 * Presentation: the one full-bleed screen in the app (LoginPage.module.css +
 * public/login-hero.jpg, the photograph from Images/login2.png), laid out to the mockup in
 * Images/login1.jpg — trail scene behind everything, mark and wordmark high in the frame,
 * sign-in on the bottom edge. Nothing about the auth flow changed with it; the previous
 * plain-card version is kept verbatim at src/_backup-pre-hero-login/LoginPage.tsx.bak.
 *
 * Also shows the app version (lib/config.ts, from package.json) so a screenshot is enough
 * to tell which build someone is on.
 */

import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { renderGoogleButton } from "../auth/google-signin";
import { ApiError, apiRequest } from "../lib/api-client";
import { APP_SLOGAN } from "../lib/branding";
import { config } from "../lib/config";
import styles from "./LoginPage.module.css";

type Provider = "GOOGLE" | "SMS" | "EMAIL";

interface AuthConfig {
  providers: Provider[];
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

  // Terms & Conditions must be accepted before any sign-in method is offered. Remembered per
  // device so a returning rider is not asked to re-tick it every visit; a fresh device (or
  // cleared storage) starts unticked. Private-mode / disabled storage just means it is not
  // remembered — never a crash.
  const [acceptedTerms, setAcceptedTerms] = useState(() => {
    try {
      return localStorage.getItem("elnino.termsAccepted") === "1";
    } catch {
      return false;
    }
  });
  const [termsNudge, setTermsNudge] = useState(false);
  useEffect(() => {
    try {
      if (acceptedTerms) localStorage.setItem("elnino.termsAccepted", "1");
      else localStorage.removeItem("elnino.termsAccepted");
    } catch {
      /* storage unavailable — acceptance just isn't remembered */
    }
    if (acceptedTerms) setTermsNudge(false);
  }, [acceptedTerms]);

  useEffect(() => {
    apiRequest<AuthConfig>("/auth/config", { anonymous: true })
      .then((authConfig) => setProviders(authConfig.providers))
      .catch(() => {
        // A server that cannot be reached used to leave this screen with no way in at all:
        // no providers, so no button, just a red banner. Google sign-in does not need the
        // server until the ID token is exchanged, so offer it anyway whenever a client id is
        // configured — if the server really is down, the attempt says so then, which is a
        // far better screen than a dead one. With no client id there is genuinely nothing to
        // offer, so the banner stands.
        if (config.googleClientId) setProviders(["GOOGLE"]);
        else setError("Could not reach the server. Check your connection and try again.");
      });
  }, []);

  // SMS sign-in is hidden for now — product decision, not a removal. The provider, the
  // request/verify handlers and the form below are untouched; flip this back to
  // `providers.includes("SMS")` to restore it.
  const smsLoginVisible = false;

  useEffect(() => {
    const slot = googleButtonRef.current;
    if (!providers.includes("GOOGLE") || !slot) return;

    // Google's real button is only mounted once the Terms box is ticked — before that the
    // slot stays empty and a disabled placeholder is shown instead. Clear it again if the
    // rider un-ticks the box.
    if (!acceptedTerms) {
      slot.innerHTML = "";
      return;
    }

    renderGoogleButton(slot, (idToken) => {
      setBusy(true);
      setError(null);
      signInWithGoogle(idToken)
        .catch((err: unknown) => setError(messageFor(err)))
        .finally(() => setBusy(false));
    }).catch(() => {
      setError("Google sign-in is unavailable right now.");
    });
  }, [providers, signInWithGoogle, acceptedTerms]);

  // Where this visitor was headed before being asked to sign in. Everything that routes here
  // sets it the same way: App.tsx's RequireAuth, the event page's "Sign in to join" and its
  // private-event fallback, and JoinPage's submit guard.
  const from = (location.state as { from?: string } | null)?.from ?? null;

  /**
   * Did they arrive with a ride already in mind?
   *
   * Someone who followed an organizer's link or QR is here for ONE event — they have already
   * found their ride, and "Find a ride" points away from the very thing they were invited to.
   * For them this screen is only the two things that stand between them and joining: the Terms
   * tick and Continue with Google. A visitor who opened /login cold still gets the browse
   * route, because for them it is a real way in rather than a detour.
   *
   * "/" is deliberately not a destination: it IS the browse screen, so the button would just
   * repeat where they are already going.
   */
  const arrivedWithDestination = from != null && from !== "/" && from !== "/login";

  if (status === "signed-in") {
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
    <main className={styles.page}>
      <div className={styles.content}>
        <header className={styles.brand}>
          <PeaksMark />
          <h1 className={styles.wordmark}>El-Niño</h1>
          <p className={styles.tagline}>{APP_SLOGAN}</p>
          <p className={styles.pitch}>
            Discover rides.
            <br />
            Meet riders.
            <br />
            Ride together.
          </p>
        </header>

        <div className={styles.actions}>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          {/* The reference screen's green call to action, in its place. Browsing rides
              genuinely needs no account (App.tsx, OpenHome), so this is a real way in, not a
              second sign-in — but only for someone who has no particular ride in mind. See
              arrivedWithDestination above. */}
          {!arrivedWithDestination && (
            <Link className={styles.browse} to="/">
              Find a ride
            </Link>
          )}

          {/* Terms gate — a real, required checkbox (not just fine print), because signing in
              here is also how a new rider registers. No sign-in method is usable until it is
              ticked; once ticked it is remembered on this device (see acceptedTerms above). */}
          {(providers.includes("GOOGLE") || (smsLoginVisible && providers.includes("SMS"))) && (
            <>
              <label className={styles.terms}>
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(event) => setAcceptedTerms(event.target.checked)}
                />
                <span>
                  I have read and agree to the{" "}
                  <Link to="/terms" target="_blank" rel="noopener noreferrer">
                    Terms &amp; Conditions
                  </Link>
                  .
                </span>
              </label>
              {termsNudge && !acceptedTerms && (
                <p className={styles.termsNudge} role="alert">
                  Please accept the Terms &amp; Conditions to continue.
                </p>
              )}
            </>
          )}

          {/* A standard email/password login is planned as a second option later — see the
              `Provider` union above, which already has "EMAIL". The button itself is
              Google's own, rendered by their script — it is not restyled, only placed. */}
          {providers.includes("GOOGLE") && (
            <>
              <p className={styles.hint}>Already a member?</p>
              {acceptedTerms ? (
                <div className={styles.googleSlot} ref={googleButtonRef} />
              ) : (
                <button
                  type="button"
                  className={styles.googlePlaceholder}
                  onClick={() => setTermsNudge(true)}
                >
                  Continue with Google
                </button>
              )}
            </>
          )}

          {smsLoginVisible && providers.includes("SMS") && (
            <section className={styles.phoneCard}>
              <h2>Continue with your phone</h2>

              {challengeId === null ? (
                <form className={styles.phoneForm} onSubmit={requestCode}>
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
                  <p className={styles.note}>
                    International format, starting with <code>+</code>.
                  </p>
                  <button
                    className={styles.submit}
                    type="submit"
                    disabled={busy || !acceptedTerms || phone.length < 8}
                  >
                    Send me a code
                  </button>
                </form>
              ) : (
                <form className={styles.phoneForm} onSubmit={submitCode}>
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
                  <button
                    className={styles.submit}
                    type="submit"
                    disabled={busy || !acceptedTerms || code.length !== 6}
                  >
                    Sign in
                  </button>
                  <button
                    className={styles.quiet}
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

          {providers.length === 0 && !error && (
            <p className={styles.hint}>Loading sign-in options…</p>
          )}

          <p className={styles.version}>Version {config.appVersion}</p>
        </div>
      </div>
    </main>
  );
}

/** The twin-peak mark above the wordmark, drawn inline so it takes its amber from CSS. */
function PeaksMark() {
  return (
    <svg className={styles.mark} viewBox="0 0 64 26" fill="none" role="img" aria-label="El Niño">
      <path
        d="M4 24 L20 4 L32 19 M28 24 L44 4 L60 24"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function messageFor(err: unknown): string {
  if (err instanceof ApiError) {
    // Only a browser that says it has no network gets the offline line — a request that
    // simply never reached the server (CORS, API down) reports what actually happened.
    if (err.offline) return "You appear to be offline.";
    if (err.status === 401) return "That code is not right. Try again.";
    if (err.status === 429) return "Too many attempts. Wait a little and try again.";
    return err.message;
  }
  return "Something went wrong. Try again.";
}
