/**
 * Rider / Organizer mode switch. Reused in the side drawer (AppDrawer.tsx) and on the account
 * page (AccountPage.tsx) so both agree. Switching is immediate and persisted — no re-login —
 * see store/userModeStore.ts. This only changes which UI is shown; it is not a permission.
 */

import { Bike, Megaphone } from "lucide-react";
import { useUserModeStore } from "../store/userModeStore";
import styles from "./UserModeToggle.module.css";

export function UserModeToggle() {
  const mode = useUserModeStore((s) => s.mode);
  const setMode = useUserModeStore((s) => s.setMode);

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.option}
        data-active={mode === "rider"}
        aria-pressed={mode === "rider"}
        onClick={() => setMode("rider")}
      >
        <Bike aria-hidden="true" />
        Rider mode
      </button>
      <button
        type="button"
        className={styles.option}
        data-active={mode === "organizer"}
        aria-pressed={mode === "organizer"}
        onClick={() => setMode("organizer")}
      >
        <Megaphone aria-hidden="true" />
        Organizer mode
      </button>
    </div>
  );
}
