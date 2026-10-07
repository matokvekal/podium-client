// "Track video" row in Create / Manage Ride (lib/route-video.ts). One short flyover video per
// TRACK, max 3 MB; only the track's owner may change it. Three shapes, chosen by the page:
//
//   live     — a saved track this rider owns (Manage Ride). Add / Replace / Remove act at once.
//   pending  — a NEW track uploaded in this form. It has no id until the ride is saved, so the
//              picked file is held by the page and uploaded right after the save.
//   readonly — someone else's track that already has a video: say so, offer nothing.

import { Clapperboard, Play } from "lucide-react";
import { useRef, useState } from "react";
import {
  deleteRouteVideo,
  formatVideoDuration,
  ROUTE_VIDEO_ACCEPT,
  type RouteVideoInfo,
  readVideoDuration,
  uploadRouteVideo,
  validateRouteVideo,
} from "../lib/route-video";
import styles from "./TrackVideoField.module.css";

type EditableProps =
  | {
      mode: "live";
      routeId: number;
      video: RouteVideoInfo | null;
      onChange: (video: RouteVideoInfo | null) => void;
    }
  | {
      mode: "pending";
      file: File | null;
      onPick: (file: File | null) => void;
    };

type Props = EditableProps | { mode: "readonly"; video: RouteVideoInfo };

export function TrackVideoField(props: Props) {
  if (props.mode === "readonly") {
    const length = formatVideoDuration(props.video.durationS);
    return (
      <div className={styles.row}>
        <span className={styles.icon} aria-hidden="true">
          <Play size={12} fill="currentColor" />
        </span>
        <span className={styles.text}>
          This track has a video{length ? ` (${length})` : ""} by its owner
        </span>
      </div>
    );
  }
  return <EditableTrackVideo {...props} />;
}

function EditableTrackVideo(props: EditableProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingLength, setPendingLength] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    const problem = validateRouteVideo(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    if (props.mode === "pending") {
      props.onPick(file);
      setPendingLength(formatVideoDuration(await readVideoDuration(file)));
      return;
    }
    setBusy("upload");
    try {
      props.onChange(await uploadRouteVideo(props.routeId, file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Video upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function onRemove() {
    setError(null);
    if (props.mode === "pending") {
      props.onPick(null);
      setPendingLength(null);
      return;
    }
    setBusy("remove");
    try {
      await deleteRouteVideo(props.routeId);
      props.onChange(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the video");
    } finally {
      setBusy(null);
    }
  }

  const has = props.mode === "live" ? props.video != null : props.file != null;
  const length =
    props.mode === "live" ? formatVideoDuration(props.video?.durationS) : pendingLength;
  const label =
    props.mode === "pending" && props.file
      ? props.file.name
      : props.mode === "live" && props.video
        ? "Track video"
        : null;

  return (
    <div className={styles.wrap}>
      <input
        ref={inputRef}
        type="file"
        accept={ROUTE_VIDEO_ACCEPT}
        className={styles.hiddenInput}
        onChange={(e) => void onFile(e.target.files?.[0])}
        tabIndex={-1}
        aria-hidden="true"
      />
      {has ? (
        <div className={styles.row}>
          <span className={styles.icon} aria-hidden="true">
            <Play size={12} fill="currentColor" />
          </span>
          <span className={styles.text}>
            <span className={styles.name}>{label}</span>
            {length && <span className={styles.length}>{length}</span>}
            {props.mode === "pending" && <span className={styles.hint}>uploads when you save</span>}
          </span>
          <span className={styles.actions}>
            <button
              type="button"
              className={styles.linkBtn}
              disabled={busy != null}
              onClick={() => inputRef.current?.click()}
            >
              {busy === "upload" ? "Uploading…" : "Replace"}
            </button>
            <button
              type="button"
              className={`${styles.linkBtn} ${styles.danger}`}
              disabled={busy != null}
              onClick={() => void onRemove()}
            >
              {busy === "remove" ? "Removing…" : "Remove"}
            </button>
          </span>
        </div>
      ) : (
        <button
          type="button"
          className={styles.addBtn}
          disabled={busy != null}
          onClick={() => inputRef.current?.click()}
        >
          {busy === "upload" ? (
            <span className="spinner" aria-hidden="true" />
          ) : (
            <Clapperboard size={16} aria-hidden="true" />
          )}
          <span>{busy === "upload" ? "Uploading video…" : "Add track video"}</span>
          <span className={styles.addHint}>MP4 / MOV / WebM · max 3 MB</span>
        </button>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
