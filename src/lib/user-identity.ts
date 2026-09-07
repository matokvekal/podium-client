/**
 * A user's persistent visual identity: an avatar and a cover that belong to the PERSON, not to
 * any one event. Every ride an organizer runs wears their identity.
 *
 * ── Why every field here is optional ───────────────────────────────────────────────────────
 *
 * This ships BEFORE the server does. Today's API returns none of these fields, and the app has
 * to behave exactly as it does now when they are absent — no blank hero, no broken image, no
 * failed login, no crash on an event whose owner predates the feature. Every type below is
 * therefore additive and optional, and every resolver treats "missing" as "try the next rung"
 * rather than as an error. An old server response stays valid; a newer server just lights up
 * a higher rung.
 *
 * ── The resolution chains ──────────────────────────────────────────────────────────────────
 *
 * The ordering rule, decided deliberately: an EXPLICIT choice outranks anything automatic, and
 * an automatic fallback must never displace an image somebody actually chose. A deterministic
 * default is a fallback, not a choice.
 *
 *   cover:   custom per-event cover (`event.customCover`) → owner server upload → owner server
 *            preset → owner local upload → owner local preset → deterministic owner default
 *            → caller's own fallback
 *
 *   The per-event cover is FIRST: a cover uploaded for one specific event stays that event's
 *   cover even after its organizer later chooses a profile cover. New events carry no per-event
 *   cover, so they fall straight through to the organizer's identity, which is the point.
 *
 *   avatar:  server upload → server preset → local upload → local preset
 *            → provider photo (Google) → caller's own fallback (the initial placeholder)
 *
 * The provider photo sits BELOW an explicit pick for the same reason the legacy event cover
 * does: a Google profile picture is a default this app inherited, not something the rider chose
 * here. If picking a preset could not visibly override it, the picker would be broken for every
 * rider who signed in with Google.
 *
 * Both chains stop at `origin: "fallback"` with a null url rather than inventing a last resort.
 * The caller owns that rung, because it differs per surface and already exists: an event cover
 * falls back to app/event-visuals.ts's built-in scene, an avatar to its initial-on-a-colour.
 * Keeping it there is also what keeps this module free of any dependency on the app layer.
 */

import { defaultPresetFor, getPresetOfType, type IdentityAssetType } from "./identity-presets";

/**
 * One asset as the server will eventually send it. Exactly one of `url` / `presetId` carries
 * the answer; `source` says which, and is advisory only — the resolvers read the fields
 * themselves so a server that omits `source` still works.
 */
export interface UserVisualAsset {
  /** Server-hosted uploaded image. */
  url?: string | null;
  /** Stable id from lib/identity-presets.ts. */
  presetId?: string | null;
  source?: "upload" | "preset" | null;
  updatedAt?: string | null;
}

/** Spliced additively onto Profile, EventOwner, participants and live riders. */
export interface UserVisualIdentity {
  avatar?: UserVisualAsset | null;
  cover?: UserVisualAsset | null;
}

/**
 * One asset as it exists on THIS DEVICE only, before the server can hold it. Distinct from
 * UserVisualAsset on purpose: `uploadDataUrl` is a local data URL that must never be mistaken
 * for a server-hosted `url`, and there is no pretending otherwise anywhere in the UI.
 */
export interface LocalVisualSelection {
  presetId: string | null;
  uploadDataUrl: string | null;
  updatedAt: number;
}

export interface LocalVisualIdentity {
  avatar: LocalVisualSelection | null;
  cover: LocalVisualSelection | null;
}

/** Which rung answered. Kept on the result so the chain is testable and debuggable. */
export type VisualOrigin =
  | "server-upload"
  | "server-preset"
  | "local-upload"
  | "local-preset"
  | "provider-photo"
  | "legacy-event"
  | "default-preset"
  | "fallback";

export interface ResolvedVisual {
  /** For `<img src>` or a CSS `url()`. Null means: caller, render your own fallback. */
  url: string | null;
  origin: VisualOrigin;
  /** Set when a registry preset answered — lets the picker mark the active thumbnail. */
  presetId: string | null;
}

const NOTHING: ResolvedVisual = { url: null, origin: "fallback", presetId: null };

/**
 * Avatars deliberately do NOT get a deterministic default preset. The existing
 * initial-on-a-hashed-colour placeholder is already stable, already attractive, and carries
 * real information (whose face is missing), and swapping it for a generic picture on every
 * rider without a Google photo is exactly the "automatic thing displacing existing behaviour"
 * the chain is designed to prevent.
 *
 * Flip to true and DEFAULT_AVATAR_POOL takes over that rung. One line, on purpose.
 */
export const AVATAR_DEFAULT_PRESET_ENABLED = false;

/**
 * Whether an owner with no explicit choice gets a cover seeded on their user id.
 *
 * This is the one intentional visual change in the feature: today an event with no cover shows
 * a scene picked from the EVENT's id, so two rides by the same organizer look unrelated. Seeding
 * on the OWNER is the point of a persistent identity. It draws from the same visual language, an
 * ownerless event is unaffected, and turning this off restores today's behaviour exactly.
 */
export const OWNER_SEEDED_DEFAULT_COVER = true;

/** A server asset is only useful if it actually carries something; `{}` or nulls fall through. */
function fromServerAsset(
  asset: UserVisualAsset | null | undefined,
  type: IdentityAssetType,
): ResolvedVisual | null {
  if (!asset) return null;
  if (asset.url) return { url: asset.url, origin: "server-upload", presetId: null };
  const preset = getPresetOfType(asset.presetId, type);
  // An unknown presetId (a preset added after this build shipped, or a corrupted value) is a
  // miss, not a hit with a broken url — so resolution continues down the chain.
  if (preset) return { url: preset.url, origin: "server-preset", presetId: preset.id };
  return null;
}

function fromLocalSelection(
  selection: LocalVisualSelection | null | undefined,
  type: IdentityAssetType,
): ResolvedVisual | null {
  if (!selection) return null;
  if (selection.uploadDataUrl) {
    return { url: selection.uploadDataUrl, origin: "local-upload", presetId: null };
  }
  const preset = getPresetOfType(selection.presetId, type);
  if (preset) return { url: preset.url, origin: "local-preset", presetId: preset.id };
  return null;
}

export interface AvatarSubject {
  /** The new, optional server field. Absent on every response today. */
  avatar?: UserVisualAsset | null;
  /** The existing flat field every endpoint already sends — the Google profile photo. */
  avatarUrl?: string | null;
}

/**
 * Resolve one person's avatar.
 *
 * `local` is only ever passed for the SIGNED-IN viewer looking at themselves — this device
 * cannot know what anybody else picked until the server can carry it.
 */
export function resolveUserAvatar(
  subject: AvatarSubject | null | undefined,
  local?: LocalVisualSelection | null,
  seed?: string | null,
): ResolvedVisual {
  return (
    fromServerAsset(subject?.avatar, "avatar") ??
    fromLocalSelection(local, "avatar") ??
    (subject?.avatarUrl
      ? { url: subject.avatarUrl, origin: "provider-photo" as const, presetId: null }
      : null) ??
    (AVATAR_DEFAULT_PRESET_ENABLED ? fromDefaultPreset("avatar", seed) : null) ??
    NOTHING
  );
}

function fromDefaultPreset(
  type: IdentityAssetType,
  seed: string | null | undefined,
): ResolvedVisual | null {
  const preset = defaultPresetFor(type, seed);
  return preset ? { url: preset.url, origin: "default-preset", presetId: preset.id } : null;
}

export interface EventCoverInput {
  /** Seeds the owner's deterministic default. Null for a legacy/ownerless event. */
  ownerId: number | null | undefined;
  /** The owner's cover as the server sent it. Absent today. */
  ownerCover?: UserVisualAsset | null;
  /** This device's temporary pick — only when the viewer IS the owner. */
  localCover?: LocalVisualSelection | null;
  /**
   * store/eventExtrasStore.ts's per-event cover: a data URL that only ever exists on the device
   * that created the ride. Predates this feature and stays supported — see the chain in the
   * file header for why it sits below explicit owner choices but above anything automatic.
   */
  legacyEventCoverDataUrl?: string | null;
}

/**
 * Resolve the cover for an event, from its owner's identity.
 *
 * Returns `origin: "fallback"` with a null url when nothing in the chain answered; the caller
 * then applies its own last resort (app/event-visuals.ts's built-in per-event scene).
 */
export function resolveEventCover(input: EventCoverInput): ResolvedVisual {
  return (
    // A cover set FOR THIS EVENT wins outright: `event.customCover ?? organizer.profileCover`.
    // An event that already carries its own uploaded cover keeps it even after its organizer
    // later picks a profile cover — see the "old events keep their cover" rule.
    (input.legacyEventCoverDataUrl
      ? { url: input.legacyEventCoverDataUrl, origin: "legacy-event" as const, presetId: null }
      : null) ??
    fromServerAsset(input.ownerCover, "cover") ??
    fromLocalSelection(input.localCover, "cover") ??
    (OWNER_SEEDED_DEFAULT_COVER && input.ownerId != null
      ? fromDefaultPreset("cover", String(input.ownerId))
      : null) ??
    NOTHING
  );
}

/** The signed-in user's own cover, for the account page preview. Same chain, no event. */
export function resolveUserCover(
  identity: UserVisualIdentity | null | undefined,
  local?: LocalVisualSelection | null,
  seed?: string | null,
): ResolvedVisual {
  return (
    fromServerAsset(identity?.cover, "cover") ??
    fromLocalSelection(local, "cover") ??
    fromDefaultPreset("cover", seed) ??
    NOTHING
  );
}

/**
 * Does this server know about visual identity at all?
 *
 * Presence of the KEY, not a truthy value: a server that supports the feature sends
 * `avatar: null` for a user who has not picked anything, and that is a different fact from a
 * server that has never heard of avatars. Until this is true the UI must not claim anything is
 * synced, and no upload request is attempted.
 */
export function serverSupportsVisualIdentity(profile: object | null | undefined): boolean {
  if (!profile) return false;
  return "avatar" in profile || "cover" in profile;
}

/**
 * Does this server return a country on the profile? Same "presence of the key" test — a server
 * with sql/030-country.sql applied sends `country: null` for a rider who has not synced one,
 * which is a different fact from a server that has never heard of the field. Until this is true
 * the account screen hides the country control and nothing PATCHes a country.
 */
export function serverSupportsCountry(profile: object | null | undefined): boolean {
  if (!profile) return false;
  return "country" in profile;
}
