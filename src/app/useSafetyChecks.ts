// React binding for the safety checklist ticks (lib/safety-checklist.ts).
//
// With an event id the ticks are kept per ride on this device; with `null` (the create form,
// where there is no ride yet) they live only in memory for as long as the caller stays mounted.
// The ride page owns one instance and hands it to the sheet, so the link on the page and the
// boxes in the sheet always agree.

import { useCallback, useEffect, useState } from "react";
import {
  isSafetyComplete,
  readSafetyChecks,
  type SafetyItemId,
  writeSafetyChecks,
} from "../lib/safety-checklist";

export interface SafetyChecks {
  checked: readonly SafetyItemId[];
  toggle(id: SafetyItemId): void;
  /** Every item ticked. */
  complete: boolean;
}

export function useSafetyChecks(eventId: string | null | undefined): SafetyChecks {
  const [checked, setChecked] = useState<readonly SafetyItemId[]>(() =>
    eventId ? readSafetyChecks(eventId) : [],
  );

  // Another ride (the page is reused between rides): show that ride's own ticks.
  useEffect(() => {
    setChecked(eventId ? readSafetyChecks(eventId) : []);
  }, [eventId]);

  const toggle = useCallback(
    (id: SafetyItemId) => {
      const next = checked.includes(id) ? checked.filter((c) => c !== id) : [...checked, id];
      setChecked(next);
      if (eventId) writeSafetyChecks(eventId, next);
    },
    [checked, eventId],
  );

  return { checked, toggle, complete: isSafetyComplete(checked) };
}
