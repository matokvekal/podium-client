/**
 * "Upload track" — a file picker that parses a GPX or CSV client-side and hands back the
 * route. No sheet, no list, no intermediate step: the button opens the OS file dialog.
 *
 * WHY IT IS ITS OWN COMPONENT. This logic lived inside CopyTrackSheet, reachable only after
 * opening a sheet whose main job was picking somebody else's ride. Uploading your own file and
 * browsing a library are two different intentions, and burying the first inside the second
 * meant a rider who HAD a Garmin export still had to go through the ride picker to use it.
 * The create form now offers both side by side, so the parse path needed to be liftable.
 *
 * CopyTrackSheet keeps its own copy of the button for EventGroupsPage's sake (which passes no
 * onUploadRoute, so it never shows there) — this is a second entry point to the same parsers,
 * not a replacement for that file.
 *
 * Format support stops at GPX and CSV deliberately: see lib/track-gpx.ts and lib/track-csv.ts
 * for why there is no FIT and no Excel.
 */

import { Upload } from "lucide-react";
import { type ChangeEvent, useRef, useState } from "react";
import type { EventRoute } from "../lib/event-route";
import { parseTrackCsv } from "../lib/track-csv";
import { parseTrackGpx } from "../lib/track-gpx";

export interface UploadedTrack {
  route: EventRoute;
  restStops: [number, number][];
  fileName: string;
}

interface TrackUploadButtonProps {
  onUploadRoute: (uploaded: UploadedTrack) => void;
  className?: string;
  children?: React.ReactNode;
}

export function TrackUploadButton({ onUploadRoute, className, children }: TrackUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again after an error
    if (!file) return;
    setError(null);
    try {
      const text = await file.text();
      const isGpx = /\.gpx$/i.test(file.name) || /^\s*<\?xml/.test(text);
      const parsed = isGpx ? parseTrackGpx(text) : parseTrackCsv(text);
      if (!parsed) {
        setError(
          isGpx
            ? "Couldn't read any track points from that GPX file."
            : "Couldn't read any points from that file — expected a CSV of lat/lon rows.",
        );
        return;
      }
      onUploadRoute({
        route: {
          points: parsed.points,
          // From the file's own <ele> / elevation column when it has one, else null — the
          // organizer can still type a value in on the create form. Never invented.
          distanceKm: parsed.distanceKm,
          elevationM: parsed.elevationGainM,
        },
        restStops: parsed.restStopIndices.map((i) => parsed.points[i]),
        fileName: file.name,
      });
    } catch {
      setError("Couldn't read that file.");
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => inputRef.current?.click()}>
        {children ?? (
          <>
            <Upload width={16} height={16} aria-hidden="true" />
            Upload track
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv,.gpx,application/gpx+xml"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />
      {error && (
        <p className="banner banner--error" role="alert" style={{ fontSize: "0.85rem" }}>
          {error}
        </p>
      )}
    </>
  );
}
