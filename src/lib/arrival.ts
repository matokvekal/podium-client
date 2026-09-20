// How a rider's arrival is labelled, in one place: the organizer's start list on the ride page,
// the rider's own row, and the Participants page all say the same thing the same way.
//
// An arrival the rider's own GPS produced (attendanceSource "auto") is shown in the accent colour
// with "Auto" on it, so the organizer can tell "the app saw them at the start" from "I ticked
// them" at a glance. Everything else — including every arrival that predates the source column —
// reads exactly as it always did.

import type { AttendanceSource, AttendanceStatus } from "./participant-types";

export type ArrivalTone = "ok" | "auto" | "warn" | "bad";

export interface ArrivalLabel {
  text: string;
  tone: ArrivalTone;
}

/** An arrival the app itself recorded. Only ever true for a rider who is actually present. */
export function isAutoArrival(
  attendanceStatus: string,
  attendanceSource: AttendanceSource | null | undefined,
): boolean {
  return (
    attendanceSource === "auto" &&
    (attendanceStatus === "present" || attendanceStatus === "started")
  );
}

/**
 * The organizer-facing arrival line. An unrecognised status is shown verbatim rather than guessed
 * into a bucket, so a new server value can never be silently mislabelled "Arrived".
 */
export function arrivalLabel(
  attendanceStatus: AttendanceStatus | string,
  attendanceSource?: AttendanceSource | null,
): ArrivalLabel {
  const auto = isAutoArrival(attendanceStatus, attendanceSource);
  switch (attendanceStatus) {
    case "present":
      return auto ? { text: "✓ Arrived · Auto", tone: "auto" } : { text: "✓ Arrived", tone: "ok" };
    // Already out on the road — arrived, and then some.
    case "started":
      return auto
        ? { text: "✓ Arrived · Auto · started", tone: "auto" }
        : { text: "✓ Arrived · started", tone: "ok" };
    case "dns":
      return { text: "Did not start", tone: "bad" };
    case "unknown":
      return { text: "Not arrived", tone: "warn" };
    default:
      return { text: attendanceStatus, tone: "warn" };
  }
}
