// Loads a ride's stop points (lib/ride-stops.ts) in their OWN request, apart from the ride and
// its route. Any failure — offline, an old server without the endpoint, anything — leaves the
// list empty and the editor off, so the ride page, map and live page look exactly as they did
// before stop points existed.

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_RIDE_STOPS_LIMITS,
  fetchRideStops,
  type RideStop,
  type RideStopsLimits,
} from "../lib/ride-stops";

export interface RideStopsState {
  stops: RideStop[];
  canManage: boolean;
  limits: RideStopsLimits;
  /** Replace the list after a local change (add / move / rename / delete). */
  setStops: (updater: (current: RideStop[]) => RideStop[]) => void;
  reload: () => void;
}

export function useRideStops(eventId: string | undefined): RideStopsState {
  const [stops, setStopsState] = useState<RideStop[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [limits, setLimits] = useState<RideStopsLimits>(DEFAULT_RIDE_STOPS_LIMITS);
  const [nonce, setNonce] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: nonce is the intentional reload trigger
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    fetchRideStops(eventId)
      .then((view) => {
        if (cancelled) return;
        setStopsState(Array.isArray(view?.stops) ? view.stops : []);
        setCanManage(view?.canManage === true);
        if (view?.limits) setLimits(view.limits);
      })
      .catch(() => {
        if (cancelled) return;
        // Fail soft: no stops, no editor. Nothing else on the page depends on this.
        setStopsState([]);
        setCanManage(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, nonce]);

  const setStops = useCallback((updater: (current: RideStop[]) => RideStop[]) => {
    setStopsState((current) => updater(current));
  }, []);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { stops, canManage, limits, setStops, reload };
}
