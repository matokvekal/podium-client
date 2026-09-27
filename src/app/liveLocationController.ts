// Imperative bridge to the ONE live-location watcher owned by LiveLocationProvider.tsx.
//
// The provider is mounted once near the app root (App.tsx, same pattern as FastResume) and has
// no parent that a page could reach through props or context without threading it through the
// whole route tree. A page that wants a rider-initiated "stop sharing" / "share again" control
// (today: LiveEventPage's Share button) calls the functions here instead; the provider is the
// only thing that ever assigns `impl`, in a layout effect that runs before any page's click
// handler could fire.
interface Impl {
  start(): void;
  stop(): void;
}

let impl: Impl | null = null;

/** Provider-only: wire up (or tear down, passing null) the real start/stop. */
export function setLiveLocationImpl(next: Impl | null): void {
  impl = next;
}

/** No-op if the provider hasn't mounted yet (should not happen — it mounts at app root). */
export function requestLiveLocationStart(): void {
  impl?.start();
}

export function requestLiveLocationStop(): void {
  impl?.stop();
}
