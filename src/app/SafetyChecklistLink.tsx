/**
 * The "Safety checklist" link on the ride page, plus — for a rider — their personal status
 * pill and the checkable sheet.
 *
 *  - `trackFor` set (a signed-in rider on this ride, never its creator, and only before the
 *    ride is over — see EventDetailPage's gate): the link carries a status pill with a face
 *    that reads at a glance — frowning red at 0 ticked, a neutral amber face partway through,
 *    a smiling green "Ready" once every item is ticked — and the sheet has checkboxes. Ticks
 *    persist per USER + RIDE (lib/safety-checklist.ts).
 *  - `trackFor` null (the creator, a signed-in non-rider, a signed-out viewer, or the ride is
 *    over): the plain link and the read-only list — nobody else's progress, nothing to tick.
 */

import { Frown, LifeBuoy, Meh, Smile } from "lucide-react";
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

/** Empty → frowning red, partway → neutral amber, everything ticked → smiling green. Three
 *  states because "not ready" alone can't tell a rider who hasn't started apart from one who
 *  has five of six — the face says which at a glance. */
type ChecklistMood = "empty" | "partial" | "ready";

function moodFor(done: number, total: number): ChecklistMood {
  if (done === total) return "ready";
  if (done === 0) return "empty";
  return "partial";
}

const MOOD_ICON: Record<ChecklistMood, typeof Smile> = { empty: Frown, partial: Meh, ready: Smile };

export function SafetyChecklistLink({ trackFor }: { trackFor: Owner | null }) {
  const [open, setOpen] = useState(false);
  const { checked, toggle } = useSafetyChecks(trackFor);
  const total = SAFETY_ITEM_IDS.length;
  const done = SAFETY_ITEM_IDS.filter((id) => checked.has(id)).length;
  const ready = done === total;
  const mood = moodFor(done, total);
  const MoodIcon = MOOD_ICON[mood];

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
          <span className={styles.status} data-mood={mood} aria-hidden="true">
            <MoodIcon width={12} height={12} strokeWidth={2.5} />
            {ready ? "Ready" : `${done}/${total}`}
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
