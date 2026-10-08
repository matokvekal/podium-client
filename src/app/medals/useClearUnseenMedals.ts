import { useCallback } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useMedalsStore } from "../../store/medalsStore";

/**
 * Marks medals seen on the server, then drops the profile's unseenMedalCount so the "New" tag and
 * the Medals-tab dot go away at once. The count only falls if the server took it — otherwise it
 * stays (and the reveal can show again next visit), which is the safe direction.
 */
export function useClearUnseenMedals() {
  const { profile, applyProfile } = useAuth();
  const markSeen = useMedalsStore((s) => s.markSeen);
  return useCallback(
    async (eventIds?: string[]) => {
      const ok = await markSeen(eventIds);
      if (!ok || !profile) return;
      const left = eventIds ? Math.max(0, (profile.unseenMedalCount ?? 0) - eventIds.length) : 0;
      if (left !== profile.unseenMedalCount) applyProfile({ ...profile, unseenMedalCount: left });
    },
    [markSeen, profile, applyProfile],
  );
}
