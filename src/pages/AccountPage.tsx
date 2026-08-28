/**
 * Account
 *
 * Route:    /account
 * Loads:    nothing — the profile is already in AuthContext
 * Actions:  choose an avatar and a cover, edit the profile, sign out
 * State:    the chosen images (store/userIdentityStore.ts) and this page's busy/error flags
 * Calls:    PATCH /users/me, POST /auth/logout
 *
 * ── The avatar/cover picker is DEVICE-LOCAL for now ────────────────────────────────────────
 *
 * There is no server field for a user's avatar/cover and no upload endpoint yet, so a pick is
 * saved on this device and the page says so, in the same spirit as the event cover hint on
 * EventCreatePage and the country field on ProfileSetupPage — both built ahead of their server
 * column. Nothing here claims to be synced and no upload request is made. The moment
 * GET /users/me starts returning these fields (serverSupportsVisualIdentity), the server value
 * wins and AuthContext reconciles the local copy away.
 *
 * Signing out revokes this session on the server and clears the tokens locally. If the
 * request cannot be made — a rider halfway up a climb with no signal — the local sign-out
 * still happens, and the session dies on its own when the refresh token expires.
 */

import { type ChangeEvent, useRef, useState } from "react";
import { Avatar } from "../app/Avatar";
import { UserModeToggle } from "../app/UserModeToggle";
import { useMyIdentity } from "../app/useMyIdentity";
import { useAuth } from "../auth/AuthContext";
import { effectiveLimits } from "../lib/entitlements";
import {
  ACCEPTED_IMAGE_ACCEPT,
  AVATAR_SPEC,
  COVER_SPEC,
  type ImageSpec,
  ImageProcessingError,
  processIdentityImage,
} from "../lib/image-processing";
import {
  AVATAR_DIMENSIONS,
  COVER_DIMENSIONS,
  type IdentityAssetType,
  presetsByCategory,
} from "../lib/identity-presets";
import {
  resolveUserAvatar,
  resolveUserCover,
  serverSupportsVisualIdentity,
} from "../lib/user-identity";
import { useUserIdentityStore } from "../store/userIdentityStore";
import styles from "./AccountPage.module.css";

const SPEC: Record<IdentityAssetType, ImageSpec> = { avatar: AVATAR_SPEC, cover: COVER_SPEC };

const SPEC_LABEL: Record<IdentityAssetType, string> = {
  avatar: `${AVATAR_DIMENSIONS.width}×${AVATAR_DIMENSIONS.height} · ${AVATAR_DIMENSIONS.aspectRatio} · ≤${AVATAR_SPEC.maxBytes / 1024} KB`,
  cover: `${COVER_DIMENSIONS.width}×${COVER_DIMENSIONS.height} · ${COVER_DIMENSIONS.aspectRatio} · ≤${COVER_SPEC.maxBytes / 1024} KB`,
};

export function AccountPage() {
  const { profile, signOut } = useAuth();
  const me = useMyIdentity();
  const [busy, setBusy] = useState(false);

  const avatar = resolveUserAvatar({ avatar: me.avatar }, me.localAvatar, me.seed);
  const cover = resolveUserCover({ avatar: me.avatar, cover: me.cover }, me.localCover, me.seed);
  const serverSupports = serverSupportsVisualIdentity(profile);

  // Plan limits + usage, straight from GET /users/me (see lib/entitlements.ts). Read-only here
  // — the server is the authority; this is just so a rider can see where they stand.
  const limits = effectiveLimits(profile);
  const usage = profile?.usage ?? null;

  return (
    <section className="stack">
      <h1>Account</h1>

      <div className="card stack">
        <p className="muted" style={{ margin: 0, fontWeight: "var(--weight-medium)" }}>
          Mode
        </p>
        <p className="muted" style={{ margin: 0 }}>
          Rider mode keeps things simple. Organizer mode adds the tools to create and manage
          events. You can switch any time.
        </p>
        <UserModeToggle />
      </div>

      <div className="card stack">
        <p className="muted" style={{ margin: 0, fontWeight: "var(--weight-medium)" }}>
          Your plan
        </p>
        <p className="muted" style={{ margin: 0 }}>
          {usage
            ? `${usage.eventsThisWeek} / ${limits.maxEventsPerWeek} rides created this week`
            : `${limits.maxEventsPerWeek} rides per week`}
        </p>
        <p className="muted" style={{ margin: 0 }}>
          Up to {limits.maxParticipantsPerEvent} riders per event
        </p>
        <p className="muted" style={{ margin: 0 }}>
          Up to {limits.maxGroupsPerEvent} ride groups per event
        </p>
        {usage && (
          <p className="muted" style={{ margin: 0 }}>
            {usage.teamsOwned} team{usage.teamsOwned === 1 ? "" : "s"} owned
          </p>
        )}
      </div>

      <div className={`card ${styles.identityCard}`}>
        <div
          className={styles.previewCover}
          style={cover.url ? { backgroundImage: `url("${cover.url}")` } : undefined}
        >
          <Avatar
            className={styles.previewAvatar}
            name={me.displayName}
            identity={me.avatar}
            localSelection={me.localAvatar}
            seed={me.seed}
          />
        </div>

        <div className={styles.previewMeta}>
          <div className={styles.previewName}>{me.displayName}</div>
          <p className="muted">
            Emergency phone: {profile?.emergencyPhone ?? "not set"}. Collected for a future
            emergency feature; not shown to anyone in this version.
          </p>
        </div>

        {me.userId != null && (
          <>
            <IdentitySlot
              type="avatar"
              userId={me.userId}
              activePresetId={avatar.presetId}
              hasChoice={avatar.origin === "local-upload" || avatar.origin === "local-preset"}
              serverSupports={serverSupports}
              busy={busy}
              onBusyChange={setBusy}
            />
            <IdentitySlot
              type="cover"
              userId={me.userId}
              activePresetId={cover.presetId}
              hasChoice={cover.origin === "local-upload" || cover.origin === "local-preset"}
              serverSupports={serverSupports}
              busy={busy}
              onBusyChange={setBusy}
            />
          </>
        )}
      </div>

      <button
        className="button button--quiet"
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void signOut().finally(() => setBusy(false));
        }}
      >
        Sign out
      </button>
    </section>
  );
}

function IdentitySlot({
  type,
  userId,
  activePresetId,
  hasChoice,
  serverSupports,
  busy,
  onBusyChange,
}: {
  type: IdentityAssetType;
  userId: number;
  activePresetId: string | null;
  /** True when THIS device holds the pick — i.e. there is something to remove. */
  hasChoice: boolean;
  serverSupports: boolean;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const selectPreset = useUserIdentityStore((s) => s.selectPreset);
  const setUpload = useUserIdentityStore((s) => s.setUpload);
  const clearSlot = useUserIdentityStore((s) => s.clearSlot);

  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Held so an oversized animated GIF can be retried as a still, if the rider chooses to.
  const [flattenable, setFlattenable] = useState<File | null>(null);

  const spec = SPEC[type];
  const title = type === "avatar" ? "Profile picture" : "Cover image";

  async function process(file: File, flattenAnimated: boolean) {
    onBusyChange(true);
    setError(null);
    setFlattenable(null);
    try {
      const processed = await processIdentityImage(file, spec, { flattenAnimated });
      setUpload(userId, type, processed.dataUrl);
    } catch (err) {
      if (err instanceof ImageProcessingError) {
        setError(err.message);
        // Only offer the lossy way out when it is genuinely the remaining option.
        if (err.canFlatten) setFlattenable(file);
      } else {
        setError(err instanceof Error ? err.message : "Could not use that image.");
      }
    } finally {
      onBusyChange(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void process(file, false);
  }

  return (
    <div className={styles.slot}>
      <div className={styles.slotHead}>
        <span className={styles.slotTitle}>{title}</span>
        <span className={styles.slotSpec}>{SPEC_LABEL[type]}</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_ACCEPT}
        onChange={onPick}
        style={{ display: "none" }}
      />

      <div className={styles.slotActions}>
        <button
          type="button"
          className="button button--quiet"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Processing…" : "Upload an image"}
        </button>
        {hasChoice && (
          <button
            type="button"
            className="button button--quiet"
            disabled={busy}
            onClick={() => {
              setError(null);
              setFlattenable(null);
              clearSlot(userId, type);
            }}
          >
            Remove
          </button>
        )}
      </div>

      {error && (
        <div className={`banner banner--error ${styles.error}`} role="alert">
          {error}
          {flattenable && (
            <>
              {" "}
              <button
                type="button"
                className="button button--quiet"
                disabled={busy}
                onClick={() => void process(flattenable, true)}
              >
                Use its first frame instead
              </button>
            </>
          )}
        </div>
      )}

      {presetsByCategory(type).map((group) => (
        <div className={styles.group} key={group.category}>
          <div className={styles.groupLabel}>{group.label}</div>
          <div className={`${styles.grid} ${type === "cover" ? styles.gridCover : ""}`}>
            {group.presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                data-active={preset.id === activePresetId}
                className={`${styles.swatch} ${
                  type === "cover" ? styles.swatchCover : styles.swatchAvatar
                }`}
                aria-label={preset.label}
                aria-pressed={preset.id === activePresetId}
                title={preset.label}
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setFlattenable(null);
                  selectPreset(userId, type, preset.id);
                }}
              >
                <img src={preset.url} alt="" width={preset.width} height={preset.height} />
              </button>
            ))}
          </div>
        </div>
      ))}

      <p className={styles.hint}>
        {serverSupports
          ? "Saved to your account."
          : "Saved on this device. It will sync to your account once the server supports it, and shows on rides you organize in the meantime."}
      </p>
    </div>
  );
}
