/**
 * "Ride Images" — the System Admin section on /admin2026 for managing the ride-cover picker
 * without a code change or a deploy (sql/052-ride-images-registry.sql).
 *
 * Independent load/error/forbidden state from the analytics dashboard above it: this section
 * calls its own endpoints (GET/POST/PATCH/DELETE /api/v1/admin/ride-images), which the server
 * gates with the exact same requireAdminAnalytics check as GET /api/v1/admin/analytics — so
 * this never grants anything the rest of the page didn't already require, it just doesn't
 * assume the analytics fetch is the only proof of that.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  type AdminRideImage,
  archiveRideImage,
  fetchAdminRideImages,
  replaceRideImage,
  setRideImageSelectable,
  uploadRideImage,
} from "../lib/admin-ride-images";
import { ApiError } from "../lib/api-client";
import { resolveApiAssetUrl } from "../lib/ride-images-dynamic";
import { useRideImagesStore } from "../store/rideImagesStore";
import styles from "./AdminAnalyticsPage.module.css";
import sectionStyles from "./AdminRideImagesSection.module.css";

type LoadState =
  | { phase: "loading" }
  | { phase: "ok"; images: AdminRideImage[] }
  | { phase: "forbidden" }
  | { phase: "error"; message: string };

const CATEGORY_OPTIONS = ["sukkot", "holidays", "road", "mtb", "gravel", "generic"] as const;

export function AdminRideImagesSection() {
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // One hidden file input serves every row's Replace button. Declared here, with the other
  // hooks, ahead of the early returns below (Rules of Hooks — see the 2026-09-29 React #310 fix).
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceTarget, setReplaceTarget] = useState<AdminRideImage | null>(null);

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    try {
      const images = await fetchAdminRideImages();
      setState({ phase: "ok", images });
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setState({ phase: "forbidden" });
        return;
      }
      setState({ phase: "error", message: "Could not load ride images." });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Every other page's picker/resolver reads store/rideImagesStore.ts, which caches for the
  // session — an admin action must invalidate that too, or the admin's own next Create/Edit
  // Ride still shows the stale list until a reload.
  const refreshPublicCatalog = useRideImagesStore((s) => s.refresh);

  async function afterChange() {
    await Promise.all([load(), refreshPublicCatalog()]);
  }

  async function handleToggleSelectable(image: AdminRideImage) {
    setActionError(null);
    setBusyKey(image.key);
    try {
      await setRideImageSelectable(image.key, !image.selectable);
      await afterChange();
    } catch {
      setActionError(`Could not update "${image.label}".`);
    } finally {
      setBusyKey(null);
    }
  }

  async function handleArchive(image: AdminRideImage) {
    if (
      !window.confirm(
        `Delete "${image.label}"? It will no longer be offered to organizers. Rides that already use it keep showing it.`,
      )
    ) {
      return;
    }
    setActionError(null);
    setBusyKey(image.key);
    try {
      await archiveRideImage(image.key);
      await afterChange();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : `Could not delete "${image.label}".`);
    } finally {
      setBusyKey(null);
    }
  }

  function startReplace(image: AdminRideImage) {
    setReplaceTarget(image);
    replaceInputRef.current?.click();
  }

  async function handleReplaceChosen(file: File | undefined) {
    const image = replaceTarget;
    if (replaceInputRef.current) replaceInputRef.current.value = "";
    setReplaceTarget(null);
    if (!file || !image) return;
    setActionError(null);
    setBusyKey(image.key);
    try {
      await replaceRideImage(image.key, file);
      await afterChange();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `Could not replace "${image.label}".`);
    } finally {
      setBusyKey(null);
    }
  }

  if (state.phase === "forbidden") return null; // the page-level "Access denied" above already said it
  if (state.phase === "loading") {
    return (
      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Ride Images</h2>
        <p className={styles.empty}>Loading…</p>
      </section>
    );
  }
  if (state.phase === "error") {
    return (
      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Ride Images</h2>
        <div className={styles.errorBox}>
          <p>{state.message}</p>
          <button type="button" className="button" onClick={() => void load()}>
            Retry
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.block}>
      <h2 className={styles.blockTitle}>
        Ride Images{" "}
        <span className={styles.blockNote}>
          · what Create/Edit Ride offers organizers — changes apply immediately, no deploy
        </span>
      </h2>

      <UploadForm onUploaded={() => void afterChange()} />

      {actionError && <p className={sectionStyles.actionError}>{actionError}</p>}

      <input
        ref={replaceInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => void handleReplaceChosen(e.target.files?.[0])}
      />

      {state.images.length === 0 ? (
        <p className={styles.empty}>No ride images.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Preview</th>
                <th className={styles.thDate}>Key</th>
                <th>Label</th>
                <th>Category</th>
                <th>Source</th>
                <th>Selectable</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {state.images.map((image) => (
                <tr key={image.key}>
                  <td>
                    <img
                      src={resolveApiAssetUrl(image.url)}
                      alt=""
                      className={sectionStyles.thumb}
                    />
                  </td>
                  <td className={styles.tdDate}>
                    <code>{image.key}</code>
                  </td>
                  <td>{image.label}</td>
                  <td>{image.category}</td>
                  <td>{image.source}</td>
                  <td>{image.selectable ? "Yes" : "No"}</td>
                  <td>
                    <div className={sectionStyles.rowActions}>
                      <button
                        type="button"
                        className="button button--small button--quiet"
                        disabled={busyKey === image.key}
                        onClick={() => void handleToggleSelectable(image)}
                      >
                        {image.selectable ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        className="button button--small button--quiet"
                        disabled={busyKey === image.key}
                        onClick={() => startReplace(image)}
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        className="button button--small button--danger"
                        disabled={busyKey === image.key}
                        onClick={() => void handleArchive(image)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function UploadForm({ onUploaded }: { onUploaded: () => void }) {
  const fileId = useId();
  const labelId = useId();
  const categoryId = useId();

  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORY_OPTIONS)[number]>("generic");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choose an image first.");
      return;
    }
    if (label.trim().length === 0) {
      setError("Give it a label.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await uploadRideImage(file, { label: label.trim(), category });
      setFile(null);
      setLabel("");
      setCategory("generic");
      const input = document.getElementById(fileId) as HTMLInputElement | null;
      if (input) input.value = "";
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={sectionStyles.uploadForm} onSubmit={(e) => void handleSubmit(e)}>
      <div className={sectionStyles.uploadRow}>
        <label htmlFor={fileId} className={sectionStyles.fieldLabel}>
          Image (JPEG/PNG/WebP, up to 4 MB — shrunk to 250 KB automatically)
        </label>
        <input
          id={fileId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>
      <div className={sectionStyles.uploadRow}>
        <label htmlFor={labelId} className={sectionStyles.fieldLabel}>
          Label
        </label>
        <input
          id={labelId}
          type="text"
          maxLength={60}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Spring Trail"
        />
      </div>
      <div className={sectionStyles.uploadRow}>
        <label htmlFor={categoryId} className={sectionStyles.fieldLabel}>
          Category
        </label>
        <select
          id={categoryId}
          value={category}
          onChange={(e) => setCategory(e.target.value as (typeof CATEGORY_OPTIONS)[number])}
        >
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      {error && <p className={sectionStyles.actionError}>{error}</p>}
      <button type="submit" className="button" disabled={submitting}>
        {submitting ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}
