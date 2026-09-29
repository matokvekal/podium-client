// "Add to Calendar" — a standard RFC 5545 .ics file built entirely on the device.
//
// TIME: the event's instant is written in UTC ("...Z"). Every calendar app converts that to the
// device's own timezone, which is exactly what the Event Details page does for the Start line
// (lib/time.ts) — so the calendar entry and the screen always agree, wherever the rider is.
// No local/floating time is ever written; that is what would shift the ride.

export interface CalendarEventInput {
  id: string;
  name: string;
  startsAt: string | null | undefined;
  /** Only used when the event really has one and it is after the start. */
  endsAt?: string | null;
  location?: string | null;
  url: string;
}

function icsUtc(date: Date): string {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[-:]/g, "");
}

/** RFC 5545 TEXT escaping: backslash, semicolon, comma and newlines. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold a content line at 75 octets-ish (by characters, never splitting a surrogate pair). */
function fold(line: string): string {
  const chars = Array.from(line);
  if (chars.length <= 73) return line;
  const parts: string[] = [];
  for (let i = 0; i < chars.length; i += 73) parts.push(chars.slice(i, i + 73).join(""));
  return parts.join("\r\n ");
}

/** The .ics text, or null when the event has no usable start time. */
export function buildEventIcs(input: CalendarEventInput, now: Date = new Date()): string | null {
  if (!input.startsAt) return null;
  const start = new Date(input.startsAt);
  if (Number.isNaN(start.getTime())) return null;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//El Nino//Ride//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${input.id}@el-nino.site`,
    `DTSTAMP:${icsUtc(now)}`,
    `DTSTART:${icsUtc(start)}`,
  ];
  if (input.endsAt) {
    const end = new Date(input.endsAt);
    if (!Number.isNaN(end.getTime()) && end.getTime() > start.getTime()) {
      lines.push(`DTEND:${icsUtc(end)}`);
    }
  }
  lines.push(`SUMMARY:${escapeText(input.name)}`);
  if (input.location?.trim()) lines.push(`LOCATION:${escapeText(input.location.trim())}`);
  lines.push(`DESCRIPTION:${escapeText(`Event details: ${input.url}`)}`);
  lines.push(`URL:${input.url}`);
  lines.push("END:VEVENT", "END:VCALENDAR");

  return `${lines.map(fold).join("\r\n")}\r\n`;
}

function icsFilename(name: string): string {
  const slug = name
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "ride"}.ics`;
}

/** Build the file and hand it to the browser as a download. Returns false if there was no
 *  usable start time (nothing is downloaded). */
export function downloadEventIcs(input: CalendarEventInput): boolean {
  const ics = buildEventIcs(input);
  if (!ics) return false;
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = icsFilename(input.name);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
  return true;
}

/**
 * Who is offered the button. Owner: always. PROMOTE ride: everyone (registration lives outside
 * El Nino, so there is no participant to check). Otherwise only a rider who is currently in
 * (registered/approved) — a rider who left has no participant row, and pending/rejected riders
 * are not confirmed for the ride.
 */
export function canAddToCalendar(event: {
  isOwner?: boolean;
  promoteOnly?: boolean;
  myParticipant?: { registrationStatus: string } | null;
}): boolean {
  if (event.isOwner || event.promoteOnly) return true;
  const status = event.myParticipant?.registrationStatus;
  return status === "registered" || status === "approved";
}
