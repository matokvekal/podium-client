import { Link, useNavigate } from "react-router-dom";
import termsPrivacyDraft from "./EL_NINO_Terms_Privacy_Draft_for_Legal_Review.md?raw";

/**
 * Terms and privacy page
 *
 * Source of truth is the legal draft markdown file that counsel edits.
 * We render it as preformatted text to preserve exact wording/line breaks.
 */
export function TermsPage() {
  const navigate = useNavigate();

  return (
    <main
      className="stack"
      style={{
        maxWidth: "56rem",
        margin: "0 auto",
        padding: "var(--space-5)",
        gap: "var(--space-4)"
      }}
    >
      <button
        type="button"
        className="button button--quiet"
        style={{ alignSelf: "flex-start" }}
        onClick={() => {
          if (window.history.length > 1) navigate(-1);
          else navigate("/");
        }}
      >
        ← Back
      </button>

      <p className="muted" style={{ margin: 0 }}>
        Draft legal text loaded from{" "}
        <code>EL_NINO_Terms_Privacy_Draft_for_Legal_Review.md</code>.
      </p>

      <pre
        style={{
          margin: 0,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-4)",
          lineHeight: 1.6,
          fontFamily: "var(--font-mono)",
          fontSize: "0.95rem"
        }}
      >
        {termsPrivacyDraft}
      </pre>

      <p className="muted" style={{ marginTop: "var(--space-3)" }}>
        <Link to="/">Return to El-Niño</Link>
      </p>
    </main>
  );
}
