/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OptionalFeatureBoundary } from "./OptionalFeatureBoundary";

afterEach(cleanup);

function Boom(): never {
  throw new Error("player chunk failed to load");
}

describe("OptionalFeatureBoundary", () => {
  it("a failing optional feature disappears; the page around it keeps rendering", () => {
    const onError = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <div>
        <p>Ride page content</p>
        <OptionalFeatureBoundary onError={onError}>
          <Boom />
        </OptionalFeatureBoundary>
      </div>,
    );
    expect(screen.getByText("Ride page content")).toBeTruthy();
    expect(onError).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    err.mockRestore();
  });

  it("renders its children when nothing fails", () => {
    render(
      <OptionalFeatureBoundary>
        <span>player</span>
      </OptionalFeatureBoundary>,
    );
    expect(screen.getByText("player")).toBeTruthy();
  });
});
