// Error boundary for an OPTIONAL extra (the track-video player): if it — or the lazy chunk that
// loads it — throws, the extra quietly disappears and the page around it keeps rendering.
// Unlike app/ErrorBoundary.tsx this never shows a full-page error: an optional feature failing is
// not the page failing.
//
// A class for the same reason ErrorBoundary is one: getDerivedStateFromError/componentDidCatch
// have no hook equivalent.

import { Component, type ReactNode } from "react";

export class OptionalFeatureBoundary extends Component<
  { children: ReactNode; onError?: (error: unknown) => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    console.warn("Optional feature failed and was hidden:", error);
    this.props.onError?.(error);
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
