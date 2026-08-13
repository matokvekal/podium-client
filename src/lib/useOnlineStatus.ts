import { useEffect, useState } from "react";

/**
 * navigator.onLine, as React state.
 *
 * It only reports whether the device has *a* network, not whether our server is reachable —
 * useful for telling a rider why nothing is loading, never for deciding that a request will
 * fail. Requests are always attempted; the API client reports what actually happened.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}
