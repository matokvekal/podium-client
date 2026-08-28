import { describe, expect, it } from "vitest";
import { getPreset } from "./identity-presets";
import {
  type LocalVisualSelection,
  OWNER_SEEDED_DEFAULT_COVER,
  resolveEventCover,
  resolveUserAvatar,
  resolveUserCover,
  serverSupportsVisualIdentity,
} from "./user-identity";

const local = (over: Partial<LocalVisualSelection> = {}): LocalVisualSelection => ({
  presetId: null,
  uploadDataUrl: null,
  updatedAt: 0,
  ...over,
});

describe("resolveUserAvatar", () => {
  it("prefers a server upload over everything", () => {
    const r = resolveUserAvatar(
      { avatar: { url: "https://cdn/a.webp" }, avatarUrl: "https://google/photo" },
      local({ uploadDataUrl: "data:image/webp;base64,zzz" }),
    );
    expect(r).toEqual({ url: "https://cdn/a.webp", origin: "server-upload", presetId: null });
  });

  it("falls to a server preset when there is no upload", () => {
    const r = resolveUserAvatar({ avatar: { presetId: "avatar-ocean-01" } });
    expect(r.origin).toBe("server-preset");
    expect(r.url).toBe(getPreset("avatar-ocean-01")?.url);
  });

  it("puts an explicit local pick above the inherited Google photo", () => {
    // Otherwise the picker would appear broken for every rider who signed in with Google.
    const r = resolveUserAvatar(
      { avatarUrl: "https://google/photo" },
      local({ presetId: "avatar-mtb-01" }),
    );
    expect(r.origin).toBe("local-preset");
    expect(r.presetId).toBe("avatar-mtb-01");
  });

  it("uses the Google photo when nothing was chosen", () => {
    const r = resolveUserAvatar({ avatarUrl: "https://google/photo" });
    expect(r).toEqual({ url: "https://google/photo", origin: "provider-photo", presetId: null });
  });

  it("ends at fallback so the caller draws its initial placeholder", () => {
    expect(resolveUserAvatar({}).origin).toBe("fallback");
    expect(resolveUserAvatar({}).url).toBeNull();
  });

  it("treats an old server response (no fields at all) as fallback, not an error", () => {
    expect(resolveUserAvatar(undefined).origin).toBe("fallback");
    expect(resolveUserAvatar(null).origin).toBe("fallback");
    expect(resolveUserAvatar({ avatar: null, avatarUrl: null }).origin).toBe("fallback");
    expect(resolveUserAvatar({ avatar: {} }).origin).toBe("fallback");
  });

  it("skips a preset id this build does not know and keeps going", () => {
    const r = resolveUserAvatar({
      avatar: { presetId: "avatar-from-a-newer-server" },
      avatarUrl: "https://google/photo",
    });
    expect(r.origin).toBe("provider-photo");
  });

  it("ignores a cover id offered as an avatar", () => {
    expect(resolveUserAvatar({ avatar: { presetId: "cover-ocean-01" } }).origin).toBe("fallback");
  });
});

describe("resolveEventCover", () => {
  const legacy = "data:image/jpeg;base64,legacy";

  it("a custom per-event cover wins outright, even over the owner's own chosen identity", () => {
    // event.customCover ?? organizer.profileCover — the event's own cover comes first, so an
    // old event that already carries an uploaded cover keeps it after its organizer later
    // picks a profile cover.
    expect(
      resolveEventCover({
        ownerId: 7,
        ownerCover: { url: "https://cdn/c.webp" },
        legacyEventCoverDataUrl: legacy,
      }).origin,
    ).toBe("legacy-event");
    expect(
      resolveEventCover({
        ownerId: 7,
        ownerCover: { presetId: "cover-forest-01" },
        legacyEventCoverDataUrl: legacy,
      }).origin,
    ).toBe("legacy-event");
    expect(
      resolveEventCover({
        ownerId: 7,
        localCover: local({ presetId: "cover-night-01" }),
        legacyEventCoverDataUrl: legacy,
      }).origin,
    ).toBe("legacy-event");
  });

  it("falls to the owner's chosen cover for an event with no custom cover of its own", () => {
    expect(
      resolveEventCover({ ownerId: 7, ownerCover: { url: "https://cdn/c.webp" } }).origin,
    ).toBe("server-upload");
    expect(
      resolveEventCover({ ownerId: 7, localCover: local({ presetId: "cover-night-01" }) }).origin,
    ).toBe("local-preset");
  });

  it("keeps the legacy event cover when the owner has chosen NOTHING", () => {
    const r = resolveEventCover({ ownerId: 7, legacyEventCoverDataUrl: legacy });
    expect(r).toEqual({ url: legacy, origin: "legacy-event", presetId: null });
  });

  it("does not let the deterministic default displace an uploaded event cover", () => {
    const withLegacy = resolveEventCover({ ownerId: 7, legacyEventCoverDataUrl: legacy });
    const withoutLegacy = resolveEventCover({ ownerId: 7 });
    expect(withLegacy.origin).toBe("legacy-event");
    expect(withoutLegacy.origin).toBe("default-preset");
  });

  it("gives an owner with no cover a stable default seeded on their id", () => {
    if (!OWNER_SEEDED_DEFAULT_COVER) return;
    const a = resolveEventCover({ ownerId: 42 });
    const b = resolveEventCover({ ownerId: 42 });
    expect(a.origin).toBe("default-preset");
    expect(a.presetId).toBe(b.presetId);
  });

  it("gives the same owner the same cover across different events", () => {
    // The whole point of the feature: identity belongs to the person, not the ride.
    const ride1 = resolveEventCover({ ownerId: 42 });
    const ride2 = resolveEventCover({ ownerId: 42 });
    expect(ride1.presetId).toBe(ride2.presetId);
  });

  it("leaves an ownerless event to the caller's own fallback", () => {
    const r = resolveEventCover({ ownerId: null });
    expect(r).toEqual({ url: null, origin: "fallback", presetId: null });
  });

  it("works with an old server response carrying none of the new fields", () => {
    expect(resolveEventCover({ ownerId: 3 }).origin).toBe("default-preset");
    expect(resolveEventCover({ ownerId: null, ownerCover: null, localCover: null }).origin).toBe(
      "fallback",
    );
  });
});

describe("resolveUserCover", () => {
  it("falls through to a deterministic default", () => {
    const r = resolveUserCover(undefined, null, "42");
    expect(r.origin).toBe("default-preset");
    expect(r.url).not.toBeNull();
  });

  it("prefers an explicit local pick", () => {
    const r = resolveUserCover({}, local({ presetId: "cover-stars-01" }), "42");
    expect(r.presetId).toBe("cover-stars-01");
  });
});

describe("serverSupportsVisualIdentity", () => {
  it("is false for today's server", () => {
    expect(serverSupportsVisualIdentity({ id: 1, nickname: "Ana" })).toBe(false);
    expect(serverSupportsVisualIdentity(null)).toBe(false);
  });

  it("is true when the key is present even though the value is null", () => {
    // "no avatar chosen yet" and "this server has never heard of avatars" are different facts.
    expect(serverSupportsVisualIdentity({ id: 1, avatar: null })).toBe(true);
  });
});
