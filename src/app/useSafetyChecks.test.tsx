/**
 * @vitest-environment jsdom
 */

// The safety checklist's promises: ticks are kept per ride on this device, "complete" is true only
// when EVERY item is ticked (that is what turns the ride page's link green), the create form (no
// ride id) keeps them in memory only, and the sheet's boxes drive the same state.

import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isSafetyComplete,
  readSafetyChecks,
  SAFETY_ITEM_IDS,
  safetyKey,
  writeSafetyChecks,
} from "../lib/safety-checklist";
import { SafetySheet } from "./SafetySheet";
import { useSafetyChecks } from "./useSafetyChecks";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("safety-checklist storage", () => {
  it("nothing stored means nothing ticked and not complete", () => {
    expect(readSafetyChecks("evt-1")).toEqual([]);
    expect(isSafetyComplete([])).toBe(false);
  });

  it("is complete only when every item is ticked", () => {
    expect(isSafetyComplete(SAFETY_ITEM_IDS.slice(0, -1))).toBe(false);
    expect(isSafetyComplete([...SAFETY_ITEM_IDS])).toBe(true);
  });

  it("round-trips per event and never leaks between rides", () => {
    writeSafetyChecks("evt-1", ["helmet", "water"]);
    expect(readSafetyChecks("evt-1")).toEqual(["helmet", "water"]);
    expect(readSafetyChecks("evt-2")).toEqual([]);
    // Under the elnino.* prefix, so sign-out wipes it.
    expect(safetyKey("evt-1").startsWith("elnino.")).toBe(true);
  });

  it("ignores junk: unknown ids, wrong types, broken JSON", () => {
    localStorage.setItem(safetyKey("evt-1"), JSON.stringify(["helmet", "jetpack", 7, null]));
    expect(readSafetyChecks("evt-1")).toEqual(["helmet"]);
    localStorage.setItem(safetyKey("evt-1"), "{not json");
    expect(readSafetyChecks("evt-1")).toEqual([]);
    localStorage.setItem(safetyKey("evt-1"), JSON.stringify({ helmet: true }));
    expect(readSafetyChecks("evt-1")).toEqual([]);
  });

  it("a storage that throws is a no-op, never an error", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readSafetyChecks("evt-1", broken)).toEqual([]);
    expect(() => writeSafetyChecks("evt-1", ["helmet"], broken)).not.toThrow();
  });
});

describe("useSafetyChecks", () => {
  it("goes complete (green) only once all items are ticked, and un-completes when one is cleared", () => {
    const { result } = renderHook(() => useSafetyChecks("evt-1"));
    expect(result.current.complete).toBe(false);

    for (const id of SAFETY_ITEM_IDS.slice(0, -1)) act(() => result.current.toggle(id));
    expect(result.current.complete).toBe(false); // five of six is still red

    act(() => result.current.toggle(SAFETY_ITEM_IDS[SAFETY_ITEM_IDS.length - 1]));
    expect(result.current.complete).toBe(true);

    act(() => result.current.toggle("helmet"));
    expect(result.current.complete).toBe(false);
  });

  it("keeps the ticks for the ride: a fresh mount sees them", () => {
    const first = renderHook(() => useSafetyChecks("evt-1"));
    act(() => first.result.current.toggle("lights"));
    first.unmount();

    const second = renderHook(() => useSafetyChecks("evt-1"));
    expect(second.result.current.checked).toEqual(["lights"]);
  });

  it("switching to another ride shows that ride's own ticks", () => {
    writeSafetyChecks("evt-2", ["gloves"]);
    const { result, rerender } = renderHook(({ id }) => useSafetyChecks(id), {
      initialProps: { id: "evt-1" },
    });
    expect(result.current.checked).toEqual([]);
    rerender({ id: "evt-2" });
    expect(result.current.checked).toEqual(["gloves"]);
  });

  it("without a ride id (create form) works in memory and stores nothing", () => {
    const { result } = renderHook(() => useSafetyChecks(null));
    act(() => result.current.toggle("helmet"));
    expect(result.current.checked).toEqual(["helmet"]);
    expect(localStorage.length).toBe(0);
  });
});

describe("SafetySheet", () => {
  function Harness() {
    const checks = useSafetyChecks("evt-1");
    return (
      <>
        <span data-testid="state">{checks.complete ? "green" : "red"}</span>
        <SafetySheet onClose={() => undefined} checks={checks} />
      </>
    );
  }

  it("has one checkbox per item and ticking all of them turns the state green", () => {
    render(<Harness />);
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(SAFETY_ITEM_IDS.length);
    expect(screen.getByTestId("state").textContent).toBe("red");

    for (const box of boxes) fireEvent.click(box);
    for (const box of screen.getAllByRole("checkbox")) expect((box as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId("state").textContent).toBe("green");
    expect(readSafetyChecks("evt-1")).toHaveLength(SAFETY_ITEM_IDS.length);

    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(screen.getByTestId("state").textContent).toBe("red");
  });
});
