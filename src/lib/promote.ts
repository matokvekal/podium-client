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
