/**
 * Rider / Organizer mode switch. Reused in the side drawer (AppDrawer.tsx) and on the account
 * page (AccountPage.tsx) so both agree. Switching is immediate and persisted — no re-login —
 * see store/userModeStore.ts. This only changes which UI is shown; it is not a permission.
 *
 * `disabled` is for an account the server has not enabled for ride creation: Organizer mode
 * is not selectable, the control locks to Rider, and the caller shows the "ask to organize"
 * path alongside it. The server is still the real gate (403 on POST /events).
 */

import { Bike, Megaphone } from "lucide-react";
import { useUserModeStore } from "../store/userModeStore";
import styles from "./UserModeToggle.module.css";

export function UserModeToggle({ disabled = false }: { disabled?: boolean }) {
  const mode = useUserModeStore((s) => s.mode);
  const setMode = useUserModeStore((s) => s.setMode);
  // Locked accounts read as Rider regardless of any stale stored preference.
  const effectiveMode = disabled ? "rider" : mode;

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.option}
        data-active={effectiveMode === "rider"}
        aria-pressed={effectiveMode === "rider"}
        onClick={() => setMode("rider")}
      >
        <Bike aria-hidden="true" />
        Rider mode
      </button>
      <button
        type="button"
        className={styles.option}
        data-active={effectiveMode === "organizer"}
        aria-pressed={effectiveMode === "organizer"}
        disabled={disabled}
        onClick={() => setMode("organizer")}
      >
        <Megaphone aria-hidden="true" />
        Organizer mode
      </button>
    </div>
  );
}
