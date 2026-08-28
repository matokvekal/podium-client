import { describe, expect, it } from "vitest";
import {
  appendPoint,
  type BroadcastConditions,
  type GpsPoint,
  locationStoppedKey,
  MAX_BUFFERED_POINTS,
  shouldTransmitLocation,
} from "./location-broadcast";

const allGo: BroadcastConditions = {
  permissionGranted: true,
  eventIsLive: true,
  eventIsFinished: false,
  userBelongsToEvent: true,
  manuallyStopped: false,
};

const point = (n: number): GpsPoint => ({
  lat: n,
  lng: n,
  recordedAt: new Date(n * 1000).toISOString(),
  emergency: false,
});

describe("shouldTransmitLocation", () => {
  it("is true only when every condition is met", () => {
    expect(shouldTransmitLocation(allGo)).toBe(true);
  });

  it("is false if any single condition fails", () => {
    expect(shouldTransmitLocation({ ...allGo, permissionGranted: false })).toBe(false);
    expect(shouldTransmitLocation({ ...allGo, eventIsLive: false })).toBe(false);
    expect(shouldTransmitLocation({ ...allGo, eventIsFinished: true })).toBe(false);
    expect(shouldTransmitLocation({ ...allGo, userBelongsToEvent: false })).toBe(false);
    expect(shouldTransmitLocation({ ...allGo, manuallyStopped: true })).toBe(false);
  });
});

describe("appendPoint", () => {
  it("appends within the cap", () => {
    const buffer = [point(1), point(2)];
    expect(appendPoint(buffer, point(3))).toHaveLength(3);
  });

  it("caps at MAX_BUFFERED_POINTS, dropping the oldest", () => {
    let buffer: GpsPoint[] = [];
    for (let i = 0; i < MAX_BUFFERED_POINTS + 50; i++) buffer = appendPoint(buffer, point(i));
    expect(buffer).toHaveLength(MAX_BUFFERED_POINTS);
    // oldest kept is index 50, newest is the last one added
    expect(buffer[0].lat).toBe(50);
    expect(buffer[buffer.length - 1].lat).toBe(MAX_BUFFERED_POINTS + 49);
  });

  it("does not mutate the input buffer", () => {
    const buffer = [point(1)];
    appendPoint(buffer, point(2));
    expect(buffer).toHaveLength(1);
  });
});

describe("locationStoppedKey", () => {
  it("is namespaced per event", () => {
    expect(locationStoppedKey("abc")).toBe("elnino.location-stopped.abc");
    expect(locationStoppedKey("abc")).not.toBe(locationStoppedKey("def"));
  });
});
