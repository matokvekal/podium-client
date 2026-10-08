// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useIncrementalList } from "./useIncrementalList";

// One fake observer per observe(); `scrollToEnd` plays the sentinel coming into view.
let observers: Array<{ cb: IntersectionObserverCallback; disconnected: boolean }> = [];
function scrollToEnd() {
  const live = observers.filter((o) => !o.disconnected).at(-1);
  act(() => live?.cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as never));
}

beforeEach(() => {
  observers = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      entry = { cb: (() => {}) as IntersectionObserverCallback, disconnected: false };
      constructor(cb: IntersectionObserverCallback) {
        this.entry.cb = cb;
        observers.push(this.entry);
      }
      observe() {}
      disconnect() {
        this.entry.disconnected = true;
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

const RIDES = Array.from({ length: 151 }, (_, i) => `ride-${i}`);

function List({ items, filter }: { items: string[]; filter: string }) {
  const page = useIncrementalList(items, filter, 20);
  return (
    <div>
      <span data-testid="badge">{`${page.total} matching`}</span>
      <ul>
        {page.visible.map((id) => (
          <li key={id}>{id}</li>
        ))}
      </ul>
      {page.hasMore && <div ref={page.sentinelRef} />}
    </div>
  );
}

describe("useIncrementalList — My Rides paging", () => {
  it("draws 20 of 151 first, 20 more per scroll, and stops at the end", () => {
    const { container, getByTestId } = render(<List items={RIDES} filter="past" />);
    expect(container.querySelectorAll("li")).toHaveLength(20);
    expect(getByTestId("badge").textContent).toBe("151 matching"); // the full count, not 20
    scrollToEnd();
    expect(container.querySelectorAll("li")).toHaveLength(40);
    for (let i = 0; i < 10; i++) scrollToEnd();
    expect(container.querySelectorAll("li")).toHaveLength(151);
  });

  it("keeps the filter's rows while loading more, and restarts at 20 when the filter changes", () => {
    const past = RIDES.filter((_, i) => i % 2 === 0); // 76 rows
    const { container, rerender } = render(<List items={past} filter="past" />);
    scrollToEnd();
    const shown = [...container.querySelectorAll("li")].map((li) => li.textContent);
    expect(shown).toEqual(past.slice(0, 40));

    rerender(<List items={RIDES.slice(0, 30)} filter="upcoming" />);
    expect(container.querySelectorAll("li")).toHaveLength(20);
  });

  it("still loads more when the list (and its sentinel) appears later, like opening See All", () => {
    function Late({ open }: { open: boolean }) {
      const page = useIncrementalList(RIDES, "past", 20);
      if (!open) return null;
      return (
        <ul>
          {page.visible.map((id) => (
            <li key={id}>{id}</li>
          ))}
          {page.hasMore && <div ref={page.sentinelRef} />}
        </ul>
      );
    }
    const { container, rerender } = render(<Late open={false} />);
    rerender(<Late open />);
    scrollToEnd();
    expect(container.querySelectorAll("li")).toHaveLength(40);
  });
});
