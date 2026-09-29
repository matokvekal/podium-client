/**
 * @vitest-environment jsdom
 */

// The PROMOTE "Registration Information" shown in place of Join.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_PROMOTE_MESSAGE } from "../lib/promote";
import { PromoteMessage } from "./PromoteMessage";

afterEach(cleanup);

describe("PromoteMessage", () => {
  it("shows the default message when none is saved (null, undefined, blank)", () => {
    for (const value of [null, undefined, "   "]) {
      const { unmount } = render(<PromoteMessage message={value} />);
      expect(screen.getByTestId("promote-message").textContent).toBe(DEFAULT_PROMOTE_MESSAGE);
      unmount();
    }
  });

  it("shows a custom message and makes an https URL inside it a clickable link", () => {
    render(
      <PromoteMessage
        message={"Registration is through Petah Tikva Municipality:\nhttps://example.com/register"}
      />,
    );
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("https://example.com/register");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(screen.getByTestId("promote-message").textContent).toContain(
      "Registration is through Petah Tikva Municipality:",
    );
  });

  it("never renders raw HTML or non-http links", () => {
    render(
      <PromoteMessage message={'<img src=x onerror=alert(1)> javascript:alert(1) <a href="x">y</a>'} />,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByTestId("promote-message").textContent).toContain("<img");
  });
});
