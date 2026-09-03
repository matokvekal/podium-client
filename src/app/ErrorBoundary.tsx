/**
 * Catches a crash in the tree below it and shows what went wrong, instead of letting React
 * unmount the whole application.
 *
 * WHY THIS EXISTS. Until now this app had NO error boundary anywhere. React's behaviour when a
 * render or an effect throws and nothing catches it is to unmount the entire tree — so a bug
 * in one modal did not break that modal, it blanked the whole PWA to a white screen. That is
 * the worst possible failure for two reasons: the rider loses everything they had on screen
 * (a half-filled ride form included), and the white page carries no information at all, so
 * "I tapped the button and got a white page" is the most anyone can report.
 *
 * So the boundary does two jobs, and the second matters as much as the first:
 *
 *   1. CONTAIN. Wrapped around a modal, a crash takes out the modal and leaves the page under
 *      it alive and intact.
 *   2. SAY WHAT HAPPENED. The error message is shown, not hidden behind a generic apology.
 *      A rider does not have a console — on a phone there is no way to open one — so a
 *      message they can read out or screenshot is the only diagnostic that will ever come
 *      back from a real device. It sits inside a collapsed <details>, so it is there when
 *      wanted and out of the way when not.
 *
 * Deliberately a class: getDerivedStateFromError/componentDidCatch have no hook equivalent.
 * This is the one place in this codebase where a class component is the correct choice.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import styles from "./ErrorBoundary.module.css";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Shown as the heading. Name the thing that broke, not the app. */
  title?: string;
  /** Rendered as a "close" action when the boundary wraps something dismissable. */
  onDismiss?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept for a desktop browser's console, where there IS one. Not the primary channel —
    // see the file comment for why the message is also rendered on screen.
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { title = "Something broke here", onDismiss } = this.props;

    return (
      <div className={styles.wrap} role="alert">
        <div className={styles.card}>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.lead}>
            The rest of the app is still fine. If this keeps happening, the detail below is what a
            developer needs — a screenshot of it is enough.
          </p>

          <details className={styles.details}>
            <summary className={styles.summary}>What went wrong</summary>
            <p className={styles.message}>{error.message || String(error)}</p>
            {error.stack && <pre className={styles.stack}>{error.stack}</pre>}
          </details>

          <div className={styles.actions}>
            <button type="button" className="button" onClick={this.reset}>
              Try again
            </button>
            {onDismiss && (
              <button type="button" className="button button--quiet" onClick={onDismiss}>
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
