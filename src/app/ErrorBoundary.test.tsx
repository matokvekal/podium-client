/**
 * @vitest-environment jsdom
 */

// A stale-chunk crash (a lazy sheet's hashed asset was replaced by a deploy while the tab was
// open) is not a bug the "Try again" button can fix — it re-runs the same broken import(). This
// pins that such a crash instead reloads the page once per tab, and that a genuine bug in a
// component still shows the ordinary crash card.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

afterEach(cleanup);
beforeEach(() => sessionStorage.clear());

function Boom({ message }: { message: string }): never {
  throw new Error(message);
}

describe("ErrorBoundary", () => {
  it("shows the crash card for an ordinary error, without reloading", () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });

    render(
      <ErrorBoundary>
        <Boom message="TypeError: cannot read properties of null" />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Something broke here")).toBeTruthy();
    expect(reload).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("reloads once for a stale-chunk CSS preload failure, and marks the session so it does not loop", () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });

    render(
      <ErrorBoundary>
        <Boom message="Unable to preload CSS for /assets/ShareEventSheet-MK27dkPe.css" />
      </ErrorBoundary>,
    );

    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("elnino.staleChunkReloaded")).toBe("1");

    vi.unstubAllGlobals();
  });

  it("does not reload a second time in the same tab — shows the crash card instead", () => {
    sessionStorage.setItem("elnino.staleChunkReloaded", "1");
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });

    render(
      <ErrorBoundary>
        <Boom message="Failed to fetch dynamically imported module: /assets/ShareEventSheet-xyz.js" />
      </ErrorBoundary>,
    );

    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByText("Something broke here")).toBeTruthy();

    vi.unstubAllGlobals();
  });
});
