/**
 * Terms & Conditions
 *
 * Route:    /terms
 * Loads:    nothing — a static document
 * Actions:  none (read-only); a Back link returns to wherever the reader came from
 * Calls:    none
 *
 * Open to everyone, signed in or not, and deliberately rendered WITHOUT the app shell — it is
 * a plain legal document, linked from the sign-in screen's "I agree to the Terms" checkbox
 * (LoginPage.tsx) and opened in a new tab so it never interrupts a sign-in in progress.
 *
 * The copy below is a plain-language DRAFT placeholder covering the sections this kind of app
 * needs (accounts, acceptable use, the assumption-of-risk clause that matters for group road
 * and trail riding, liability, privacy, changes). Replace the wording once it has had a legal
 * review — keep the route, the id anchors and the "last updated" line.
 */

import { Link, useNavigate } from "react-router-dom";

const LAST_UPDATED = "30 August 2026";

export function TermsPage() {
  const navigate = useNavigate();

  return (
    <main
      className="stack"
      style={{ maxWidth: "44rem", margin: "0 auto", padding: "var(--space-5)" }}
    >
      <button
        type="button"
        className="button button--quiet"
        style={{ alignSelf: "flex-start" }}
        onClick={() => {
          // Prefer a real back step (the reader came from the sign-in screen); fall back home
          // for someone who opened /terms directly.
          if (window.history.length > 1) navigate(-1);
          else navigate("/");
        }}
      >
        ← Back
      </button>

      <h1>Terms &amp; Conditions</h1>
      <p className="muted">
        Last updated {LAST_UPDATED}. This is a working draft pending final legal review.
      </p>

      <p>
        These terms are the agreement between you and El-Niño for using the El-Niño app and website
        (the "Service"). By ticking "I have read and agree to the Terms &amp; Conditions" when you
        sign in, you accept these terms. If you do not agree, do not use the Service.
      </p>

      <h2>1. Who can use El-Niño</h2>
      <p>
        You must be at least 16 years old, or the age of digital consent where you live, whichever
        is higher. You are responsible for keeping your account secure and for everything done
        through it.
      </p>

      <h2>2. Your account</h2>
      <p>
        You sign in with a third-party provider (for example Google). We receive only your name and
        email to identify you. The profile details you add — nickname, country, emergency contact —
        are yours to correct or remove at any time from your account settings.
      </p>

      <h2>3. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>break the law or encourage others to;</li>
        <li>harass, threaten or endanger other riders;</li>
        <li>post content that is not yours to share, or that is misleading about a ride;</li>
        <li>scrape, overload or try to break the Service;</li>
        <li>share another rider's live location or personal details outside the Service.</li>
      </ul>

      <h2>4. Rides, routes and your safety</h2>
      <p>
        El-Niño helps you find rides and other riders. It does not organise, lead, vet or supervise
        any ride, and it does not check that a route is safe, legal or accurate. Cycling on roads
        and trails carries real risk of injury or death.
      </p>
      <p>
        <strong>You take part in every ride at your own risk.</strong> You are responsible for your
        own equipment, fitness, insurance, following the rules of the road, wearing a helmet where
        required, and deciding whether a ride and route are right for you. Ride organisers listed in
        the app are other users, not El-Niño staff.
      </p>

      <h2>5. Content you add</h2>
      <p>
        You keep ownership of the events, routes, photos and text you add. You give El-Niño a
        licence to store and show that content within the Service so it works as intended. You can
        delete your content, and we will remove it within a reasonable time except where we must
        keep a copy for legal reasons.
      </p>

      <h2>6. Service availability</h2>
      <p>
        The Service is provided "as is". We work to keep it running but we do not promise it will be
        uninterrupted, error-free, or that live locations and event data will always be current.
      </p>

      <h2>7. Liability</h2>
      <p>
        To the extent the law allows, El-Niño is not liable for injury, loss or damage arising from
        your use of the Service, from any ride you find or join through it, or from the acts of
        other users. Nothing in these terms limits liability that cannot be limited by law.
      </p>

      <h2>8. Privacy</h2>
      <p>
        We collect the minimum needed to run the Service — who you are, the rides you organise or
        join, and, only while you choose to share it during a live ride, your location. We do not
        sell your data. A full privacy notice will be linked here.
      </p>

      <h2>9. Changes to these terms</h2>
      <p>
        We may update these terms. If a change is significant we will ask you to accept the new
        version the next time you sign in. Continuing to use the Service after a change means you
        accept it.
      </p>

      <h2>10. Contact</h2>
      <p>
        Questions about these terms: <a href="mailto:hello@elnino.app">hello@elnino.app</a>.
      </p>

      <p className="muted" style={{ marginTop: "var(--space-5)" }}>
        <Link to="/">Return to El-Niño</Link>
      </p>
    </main>
  );
}
