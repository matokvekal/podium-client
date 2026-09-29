// PROMOTE (server sql/053): a normal, fully viewable event whose registration is handled by the
// organizers, not El Nino. The only client logic it needs is turning URLs in the description into
// links.

export type DescriptionPart =
  | { kind: "text"; text: string }
  | { kind: "link"; href: string; text: string };

const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
// Sentence punctuation that trails a pasted URL is not part of it.
const TRAILING_PUNCTUATION = /[.,;:!?)\]}"'׳״]+$/;

/**
 * Splits plain text into text and http(s) link parts. Never produces HTML: the caller renders
 * each part as a React text node or an <a>, so nothing in the description can inject markup, and
 * only http/https URLs can ever become links (no javascript:, data:, mailto:).
 */
/** Shown on a PROMOTE event in place of Join when the organizer wrote no message of their own. */
export const DEFAULT_PROMOTE_MESSAGE = "Registration is handled by the organizer.";

/** The text to show for a PROMOTE event: the saved message, else the default. */
export function promoteMessageOf(message: string | null | undefined): string {
  return message?.trim() ? message : DEFAULT_PROMOTE_MESSAGE;
}

/**
 * What to save as the Organizer display name. Only a name that differs from the creator's own is
 * stored (events.organizer_group); the creator's own name, or a blank field, is null, so the ride
 * keeps following the account's name instead of freezing a copy of it. Display only: it has no
 * bearing on who owns the event.
 */
export function organizerForRequest(typed: string, creatorName: string): string | null {
  const name = typed.trim();
  return !name || name === creatorName.trim() ? null : name;
}

/** The organizer a viewer sees: the saved display name, else this device's team/club name, else
 *  the real owner's name. `custom` = a typed name rather than an account (no avatar of its own). */
export function organizerDisplay(
  savedName: string | null | undefined,
  localName: string | null | undefined,
  ownerName: string | null | undefined,
): { name: string | null; custom: boolean } {
  const custom = savedName?.trim() || localName?.trim() || null;
  return custom
    ? { name: custom, custom: true }
    : { name: ownerName?.trim() || null, custom: false };
}

export function splitDescriptionLinks(text: string): DescriptionPart[] {
  const parts: DescriptionPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const raw = match[0];
    const trimmed = raw.replace(TRAILING_PUNCTUATION, "");
    let href: string;
    try {
      const url = new URL(trimmed);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      href = url.href;
    } catch {
      continue;
    }
    if (start > last) parts.push({ kind: "text", text: text.slice(last, start) });
    parts.push({ kind: "link", href, text: trimmed });
    last = start + trimmed.length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}
