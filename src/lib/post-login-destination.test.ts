import { describe, expect, it } from "vitest";
import { postLoginDestination } from "./post-login-destination";

describe("postLoginDestination", () => {
  it("keeps the ride someone was actually headed for", () => {
    expect(postLoginDestination("/join/ABC123")).toBe("/join/ABC123");
    expect(postLoginDestination("/events/42")).toBe("/events/42");
  });

  it("sends a rider to the main page instead of their own account", () => {
    expect(postLoginDestination("/account")).toBe("/");
    expect(postLoginDestination("/account/setup")).toBe("/");
  });

  it("treats no destination, home and the login screen itself as the main page", () => {
    expect(postLoginDestination(null)).toBe("/");
    expect(postLoginDestination(undefined)).toBe("/");
    expect(postLoginDestination("/")).toBe("/");
    expect(postLoginDestination("/login")).toBe("/");
  });

  it("does not mistake another route for an account one", () => {
    expect(postLoginDestination("/accounts-payable")).toBe("/accounts-payable");
  });
});
