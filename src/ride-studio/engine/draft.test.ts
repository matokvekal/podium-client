import { describe, expect, it } from "vitest";
import { createDraft, defaultStudioLocale, draftHasContent, parseStoredDraft } from "./draft";
import { clearDraft, draftStorageKey, loadDraft, saveDraft } from "./draft-storage";
import { applyAnswers } from "./flow";

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
}

const base = () =>
  createDraft({
    locale: "en",
    country: "IL",
    submissionId: "22222222-2222-4222-8222-222222222222",
    now: 5,
  });

describe("the draft", () => {
  it("starts with a fresh submission id each time", () => {
    const a = createDraft({ locale: "en" });
    const b = createDraft({ locale: "en" });
    expect(a.submissionId).not.toBe(b.submissionId);
    expect(a.submissionId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("is not worth saving until something is in it", () => {
    expect(draftHasContent(base())).toBe(false);
    const named = applyAnswers(base(), [
      { questionId: "ride.name", field: "name", value: "x", source: "ui" },
    ]).draft;
    expect(draftHasContent(named)).toBe(true);
  });

  it("round-trips through JSON unchanged", () => {
    const { draft } = applyAnswers(base(), [
      { questionId: "ride.type", field: "activityType", value: "mtb", source: "ui" },
      { questionId: "ride.name", field: "name", value: "Trail day", source: "ui" },
      { questionId: "ride.start", field: "startsAt", value: "2027-03-02T07:00", source: "ui" },
    ]);
    expect(parseStoredDraft(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
  });

  it("rejects anything that is not a version-1 draft", () => {
    expect(parseStoredDraft(null)).toBeNull();
    expect(parseStoredDraft("nope")).toBeNull();
    expect(parseStoredDraft({ ...base(), schemaVersion: 2 })).toBeNull();
    expect(parseStoredDraft({ ...base(), submissionId: 5 })).toBeNull();
    expect(parseStoredDraft({ ...base(), locale: "fr" })).toBeNull();
    expect(parseStoredDraft({ ...base(), answered: [1] })).toBeNull();
  });

  it("drops a stored value it does not understand instead of trusting it", () => {
    const parsed = parseStoredDraft({
      ...base(),
      activityType: "hiking",
      visibility: "friends",
      route: { kind: "x" },
    });
    expect(parsed?.activityType).toBeNull();
    expect(parsed?.visibility).toBeNull();
    expect(parsed?.route).toBeNull();
  });
});

describe("language default", () => {
  it("Israel gets Hebrew; otherwise the device language; otherwise English", () => {
    expect(defaultStudioLocale("IL", ["en-US"])).toBe("he");
    expect(defaultStudioLocale("US", ["he-IL"])).toBe("he");
    expect(defaultStudioLocale("US", ["fr-FR", "en-GB"])).toBe("en");
    expect(defaultStudioLocale(null, ["fr-FR"])).toBe("en");
    expect(defaultStudioLocale(null, [])).toBe("en");
  });
});

describe("saving and resuming", () => {
  it("keeps one slot per user", () => {
    const storage = new MemoryStorage();
    const mine = applyAnswers(base(), [
      { questionId: "ride.name", field: "name", value: "Mine", source: "ui" },
    ]).draft;
    expect(saveDraft(7, mine, storage)).toBe(true);
    expect(loadDraft(7, storage)).toEqual(mine);
    expect(loadDraft(8, storage)).toBeNull();
    expect(storage.getItem(draftStorageKey(7))).not.toBeNull();
  });

  it("saving an empty draft clears the slot instead", () => {
    const storage = new MemoryStorage();
    const named = applyAnswers(base(), [
      { questionId: "ride.name", field: "name", value: "x", source: "ui" },
    ]).draft;
    saveDraft(1, named, storage);
    saveDraft(1, base(), storage);
    expect(loadDraft(1, storage)).toBeNull();
  });

  it("clearDraft removes it", () => {
    const storage = new MemoryStorage();
    const named = applyAnswers(base(), [
      { questionId: "ride.name", field: "name", value: "x", source: "ui" },
    ]).draft;
    saveDraft(1, named, storage);
    clearDraft(1, storage);
    expect(loadDraft(1, storage)).toBeNull();
  });

  it("survives corrupt JSON and storage that throws", () => {
    const storage = new MemoryStorage();
    storage.setItem(draftStorageKey(1), "{not json");
    expect(loadDraft(1, storage)).toBeNull();

    const broken = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
      removeItem() {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    const named = applyAnswers(base(), [
      { questionId: "ride.name", field: "name", value: "x", source: "ui" },
    ]).draft;
    expect(loadDraft(1, broken)).toBeNull();
    expect(saveDraft(1, named, broken)).toBe(false);
    expect(() => clearDraft(1, broken)).not.toThrow();
  });
});
