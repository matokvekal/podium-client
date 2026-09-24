/**
 * The "Safety checklist" link on the ride page, plus — for a rider — their personal status
 * pill and the checkable sheet.
 *
 *  - `trackFor` set (a signed-in rider on this ride, never its creator): the link carries a
 *    red "2/6" pill until every item is ticked, then a green "✓ Ready"; the sheet has
 *    checkboxes. Ticks persist per USER + RIDE (lib/safety-checklist.ts).
 *  - `trackFor` null (the creator, a signed-in non-rider, a signed-out viewer): the plain link
 *    and the read-only list — nobody else's progress, nothing to tick.
 */

import { Check, LifeBuoy } from "lucide-react";
import { useCallback, useState } from "react";
import {
  readSafetyChecks,
  SAFETY_ITEM_IDS,
  type SafetyItemId,
  writeSafetyChecks,
} from "../lib/safety-checklist";
import styles from "./SafetyChecklistLink.module.css";
import { SafetySheet } from "./SafetySheet";

type Owner = { userId: number; rideId: string };

function useSafetyChecks(trackFor: Owner | null) {
  const key = trackFor ? `${trackFor.userId}.${trackFor.rideId}` : null;
  const load = () =>
    trackFor ? readSafetyChecks(trackFor.userId, trackFor.rideId) : new Set<SafetyItemId>();
  const [state, setState] = useState(() => ({ key, checked: load() }));
  // Another ride or another account → re-read that pair's own ticks during render, so the
  // previous pair's state is never shown for even one frame.
  let current = state;
  if (state.key !== key) {
    current = { key, checked: load() };
    setState(current);
  }

  const userId = trackFor?.userId;
  const rideId = trackFor?.rideId;
  const toggle = useCallback(
    (id: SafetyItemId) => {
      if (userId == null || rideId == null) return;
      setState((prev) => {
        const checked = new Set(prev.checked);
        if (checked.has(id)) checked.delete(id);
        else checked.add(id);
        writeSafetyChecks(userId, rideId, checked);
        return { ...prev, checked };
      });
    },
    [userId, rideId],
  );
  return { checked: current.checked, toggle };
}

export function SafetyChecklistLink({ trackFor }: { trackFor: Owner | null }) {
  const [open, setOpen] = useState(false);
  const { checked, toggle } = useSafetyChecks(trackFor);
  const total = SAFETY_ITEM_IDS.length;
  const done = SAFETY_ITEM_IDS.filter((id) => checked.has(id)).length;
  const ready = done === total;

  return (
    <>
      <button
        type="button"
        className={styles.link}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={
          trackFor
            ? `Safety checklist, ${ready ? "ready" : `${done} of ${total} ready`}`
            : undefined
        }
      >
        <LifeBuoy aria-hidden="true" width={15} height={15} />
        <span className={styles.linkText}>Safety checklist</span>
        {trackFor && (
          <span className={styles.status} data-ready={ready || undefined} aria-hidden="true">
            {ready ? (
              <>
                <Check width={12} height={12} strokeWidth={3} />
                Ready
              </>
            ) : (
              `${done}/${total}`
            )}
          </span>
        )}
      </button>
      {open && (
        <SafetySheet
          onClose={() => setOpen(false)}
          {...(trackFor ? { checked, onToggle: toggle } : {})}
        />
      )}
    </>
  );
}
