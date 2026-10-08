import { describe, expect, it } from "vitest";
import { isMyOrganizedRide } from "./ride-managers";

describe("isMyOrganizedRide", () => {
  it("a ride I created", () => {
    expect(isMyOrganizedRide({ ownerId: 7, myRole: "owner" }, 7)).toBe(true);
  });

  it("a ride whose creator made me a manager", () => {
    expect(isMyOrganizedRide({ ownerId: 1, myRole: "operator" }, 7)).toBe(true);
  });

  it("a ride I only joined", () => {
    expect(isMyOrganizedRide({ ownerId: 1, myRole: null }, 7)).toBe(false);
  });

  it("a cached row from an older server, without myRole, falls back to ownerId", () => {
    expect(isMyOrganizedRide({ ownerId: 7 }, 7)).toBe(true);
    expect(isMyOrganizedRide({ ownerId: 1 }, 7)).toBe(false);
  });
});
