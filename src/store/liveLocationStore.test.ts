import { beforeEach, describe, expect, it } from "vitest";
import { reportRideConfirmation, useLiveLocationStore } from "./liveLocationStore";

// This store (and reportRideConfirmation, its one writer) is the actual fix for the bug where a
// genuinely registered rider on a live ride could see the route but never their own marker: the
// old design trusted whatever `event.myParticipant` a single page's state held, including a
// cache/offline stand-in that hardcodes it to null while the real fetch is in flight or has
// failed once. These tests are about that rule, not about React or the DOM.

function resetStore() {
  useLiveLocationStore.setState({
    activeRide: null,
    status: "off",
    selfPosition: null,
  });
}

describe("reportRideConfirmation", () => {
  beforeEach(resetStore);

  it("claims the active-ride slot when live and registered", () => {
    reportRideConfirmation("ride-1", "live", undefined, { id: 42 });
    expect(useLiveLocationStore.getState().activeRide).toEqual({
      eventId: "ride-1",
      participantId: 42,
    });
  });

  it("prefers effectiveStatus over the raw status", () => {
    reportRideConfirmation("ride-1", "published", "live", { id: 42 });
    expect(useLiveLocationStore.getState().activeRide?.eventId).toBe("ride-1");
  });

  it("does not claim the slot for a non-participant, even on a live ride", () => {
    reportRideConfirmation("ride-1", "live", undefined, null);
    expect(useLiveLocationStore.getState().activeRide).toBeNull();
  });

  it("does not claim the slot for a registered rider once the ride is no longer live", () => {
    reportRideConfirmation("ride-1", "finished", undefined, { id: 42 });
    expect(useLiveLocationStore.getState().activeRide).toBeNull();
  });

  it("a losing confirmation for a DIFFERENT ride never clears the currently active one", () => {
    reportRideConfirmation("ride-1", "live", undefined, { id: 42 });
    reportRideConfirmation("ride-2", "published", undefined, null);
    expect(useLiveLocationStore.getState().activeRide).toEqual({
      eventId: "ride-1",
      participantId: 42,
    });
  });

  it("a losing confirmation for the SAME ride clears it", () => {
    reportRideConfirmation("ride-1", "live", undefined, { id: 42 });
    reportRideConfirmation("ride-1", "finished", undefined, { id: 42 });
    expect(useLiveLocationStore.getState().activeRide).toBeNull();
  });

  it("switching to a second live registered ride replaces the first", () => {
    reportRideConfirmation("ride-1", "live", undefined, { id: 42 });
    reportRideConfirmation("ride-2", "live", undefined, { id: 7 });
    expect(useLiveLocationStore.getState().activeRide).toEqual({
      eventId: "ride-2",
      participantId: 7,
    });
  });
});

describe("clearActiveRideIfCurrent", () => {
  beforeEach(resetStore);

  it("clears only when the given id matches the current active ride", () => {
    useLiveLocationStore.getState().setActiveRide({ eventId: "ride-1", participantId: 1 });
    useLiveLocationStore.getState().clearActiveRideIfCurrent("ride-2");
    expect(useLiveLocationStore.getState().activeRide?.eventId).toBe("ride-1");

    useLiveLocationStore.getState().clearActiveRideIfCurrent("ride-1");
    expect(useLiveLocationStore.getState().activeRide).toBeNull();
  });
});
