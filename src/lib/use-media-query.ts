// A React binding for a CSS media query, for the cases where a breakpoint has to change the
// *markup* rather than only its styling.
//
// Almost every responsive rule in this app belongs in CSS. This hook exists for the one thing
// CSS cannot do: swap one control for a different control. On phones narrower than ~350px the
// create-ride form's chip/bar/segmented pickers stop fitting on a line at all, and the honest
// fix there is a native <select> — a different element, not a restyled one. Rendering both and
// hiding one with `display: none` was the alternative and is worse: two live form controls per
// field, duplicated labels for a screen reader, and two elements to keep in sync.

import { useEffect, useState } from "react";

/** `true` while `query` matches. Re-renders on change; safe when matchMedia is unavailable. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    // Re-read on subscribe: the query can already have flipped between the initial render and
    // this effect (a rotation during mount, a re-run with a different `query`).
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
