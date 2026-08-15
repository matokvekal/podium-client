// ISO 3166-1 alpha-2 -> flag emoji. Regional indicator symbols are U+1F1E6..U+1F1FF, one per
// A-Z; a country's flag emoji is just its two letters mapped onto that range and concatenated.
// No icon assets needed.

export function countryFlagEmoji(countryCode: string): string {
  const code = countryCode.trim().toUpperCase();
  if (code.length !== 2) return "";
  const codePoints = [...code].map((char) => 0x1f1e6 + (char.charCodeAt(0) - 65));
  if (codePoints.some((point) => point < 0x1f1e6 || point > 0x1f1ff)) return "";
  return String.fromCodePoint(...codePoints);
}
