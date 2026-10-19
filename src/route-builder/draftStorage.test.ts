/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDraft,
  DRAFT_MAX_AGE_MS,
  DRAFT_MAX_CHARS,
  DRAFT_STORAGE_KEY,
  loadDraft,
  saveDraft,
} from "./draftStorage";
import { addWaypoint, emptyDraft } from "./model";
import { useRouteBuilderStore } from "./store";

const draft = addWaypoint(addWaypoint(emptyDraft("mtb"), [31.85, 34.95]), [31.83, 34.97]);

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("draft storage", () => {
  it("keeps one draft across a reload", () => {
    expect(saveDraft(draft, 1000)).toEqual({ ok: true });
    expect(loadDraft(2000)).toEqual({ draft, savedAt: 1000 });
  });

  it("drops a draft older than seven days", () => {
    saveDraft(draft, 0);
    expect(loadDraft(DRAFT_MAX_AGE_MS + 1)).toBeNull();
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it("refuses a draft over the size budget without touching the stored one", () => {
    saveDraft(draft, 1);
    const huge = { ...draft, name: "x".repeat(DRAFT_MAX_CHARS) };
    expect(saveDraft(huge)).toEqual({ ok: false, reason: "too-large" });
    expect(loadDraft(2)?.draft).toEqual(draft);
  });

  it("reports a full storage quota instead of throwing", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(saveDraft(draft)).toEqual({ ok: false, reason: "quota" });
  });

  it("ignores unreadable or wrong-shaped data", () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, "{not json");
    expect(loadDraft()).toBeNull();
    localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({ savedAt: Date.now(), draft: { waypoints: 1 } }),
    );
    expect(loadDraft()).toBeNull();
  });

  it("an empty draft clears storage, and clearDraft removes it", () => {
    saveDraft(draft);
    saveDraft(emptyDraft());
    expect(loadDraft()).toBeNull();
    saveDraft(draft);
    clearDraft();
    expect(loadDraft()).toBeNull();
  });
});

describe("undo / redo", () => {
  it("undoes and redoes edits, and routing patches are not undo steps", () => {
    const store = useRouteBuilderStore.getState();
    store.reset(emptyDraft());
    store.edit((d) => addWaypoint(d, [31.85, 34.95]));
    store.edit((d) => addWaypoint(d, [31.83, 34.97]));
    useRouteBuilderStore.getState().patch((d) => ({ ...d, name: "patched" }));
    expect(useRouteBuilderStore.getState().past).toHaveLength(2);

    useRouteBuilderStore.getState().undo();
    expect(useRouteBuilderStore.getState().draft.waypoints).toHaveLength(1);
    useRouteBuilderStore.getState().redo();
    expect(useRouteBuilderStore.getState().draft.waypoints).toHaveLength(2);

    useRouteBuilderStore.getState().undo();
    useRouteBuilderStore.getState().edit((d) => addWaypoint(d, [31.7, 35]));
    expect(useRouteBuilderStore.getState().future).toHaveLength(0);
  });

  it("an edit that changes nothing is not recorded", () => {
    const store = useRouteBuilderStore.getState();
    store.reset(emptyDraft());
    store.edit((d) => d);
    expect(useRouteBuilderStore.getState().past).toHaveLength(0);
  });
});
