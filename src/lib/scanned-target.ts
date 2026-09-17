// What a scanned QR code actually points at.
//
// Lives here rather than in JoinPage.tsx for the reason every other lib/ helper does: it is
// pure string handling with one real failure mode, and it should be verifiable without a
// camera — or, as it turned out, without pulling the whole page and its config import into a
// test that only wants to parse a URL.

/** What a scanned QR turned out to be. */
export type ScannedTarget =
  /** One ride, by code — a /join/<code> QR, or a bare code someone made themselves. */
  | { kind: "code"; code: string }
  /** Several rides sharing one link — a /share/<codeA>-<codeB> QR. */
  | { kind: "share"; codes: string[] };

/**
 * Read a scanned QR.
 *
 * ⚠ WHY THIS IS NOT JUST "THE LAST PATH SEGMENT"
 *   It used to be, and that quietly broke the moment rides could share one link (server:
 *   sql/037). A scanned `/share/19092026A-19092026B` came back as the single code
 *   "19092026A-19092026B", which no ride has, so the rider was told "No ride has that code" —
 *   at the start line, with both groups standing there and a printed QR on a sign.
 *
 *   The phone's own camera app was never affected: it just opens the URL and the router handles
 *   /share. Only the IN-APP scanner was blind to it, which is also the scanner an organizer
 *   tests with, so it looked fine right up to the moment it mattered.
 *
 * A bare code string still works, so a homemade QR, a hand-typed code, or some future non-URL
 * format is unaffected.
 */
export function extractScanned(scannedText: string): ScannedTarget {
  const text = scannedText.trim();
  try {
    const url = new URL(text);
    const segments = url.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1];
    if (!last) return { kind: "code", code: text };

    const decoded = decodeURIComponent(last);

    // The chooser link. Keyed on the path segment BEFORE the codes rather than on the presence
    // of a separator, so a ride code that somehow contains a dash is never split in two.
    if (segments[segments.length - 2]?.toLowerCase() === "share") {
      const codes = decoded
        .split(/[-,+]/)
        .map((code) => code.trim())
        .filter((code) => code.length > 0);
      if (codes.length > 1) return { kind: "share", codes };
      // A /share/ link with one code left in it is a group that has shrunk back to one ride.
      if (codes.length === 1) return { kind: "code", code: codes[0] };
      return { kind: "code", code: text };
    }

    return { kind: "code", code: decoded };
  } catch {
    // Not a URL — treat the scanned text itself as the code.
  }
  return { kind: "code", code: text };
}
