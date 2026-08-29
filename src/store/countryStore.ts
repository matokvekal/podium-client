// The country the rider picked on ProfileSetupPage, persisted client-side.
//
// TEMPORARY home for this value: there is no `country` column on the server yet (see the
// country-filter feature / BUGS.md), so the pick lives on the device for now — the same
// "built ahead of its server column" spirit as the avatar/cover picker on AccountPage. Once
// GET /users/me returns a country, that becomes the source of truth and this is reconciled
// away.
//
// It IS authenticated-user data, so it is `podium.*` namespaced and gets cleared on logout.
// Same zustand + persist pattern as store/userModeStore.ts.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isKnownCountryCode } from "../lib/countries";

interface CountryState {
  /** ISO 3166-1 alpha-2, or null when the rider has never picked one. */
  code: string | null;
  setCountry(code: string): void;
}

export const useCountryStore = create<CountryState>()(
  persist(
    (set) => ({
      code: null,
      setCountry(code) {
        set({ code });
      },
    }),
    {
      name: "podium.country",
      // A stored value this build no longer knows (list trimmed, junk) resolves to null so the
      // picker falls through to locale detection rather than showing a broken option.
      merge: (persisted, current) => {
        const code = (persisted as { code?: unknown } | undefined)?.code;
        return { ...current, code: isKnownCountryCode(code) ? code : null };
      },
    },
  ),
);
