/**
 * @vitest-environment jsdom
 */

// The register screen: ONE checkbox covers every consent, "Find a ride" is a quiet link rather
// than the main button, and the Terms link stays in the same tab so Back returns here.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    status: "signed-out",
    signInWithGoogle: vi.fn(),
    verifySmsCode: vi.fn(),
  }),
}));
vi.mock("../auth/google-signin", () => ({
  renderGoogleButton: vi.fn(() => Promise.resolve()),
}));
vi.mock("../lib/api-client", () => ({
  ApiError: class extends Error {},
  apiRequest: vi.fn(() => Promise.resolve({ providers: ["GOOGLE"] })),
}));

const { LoginPage } = await import("./LoginPage");

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <LoginPage />
    </MemoryRouter>
  );
}

describe("LoginPage consents", () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it("shows a single checkbox", async () => {
    renderLogin();
    await screen.findByText("Continue with Google");
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  });

  it("one tick records all three consents, un-ticking clears them", async () => {
    renderLogin();
    const box = await screen.findByRole("checkbox");
    fireEvent.click(box);
    expect(localStorage.getItem("elnino.termsAccepted")).toBe("1");
    expect(localStorage.getItem("elnino.infoMessagesAccepted")).toBe("1");
    expect(localStorage.getItem("elnino.thirdPartySharingAccepted")).toBe("1");
    fireEvent.click(box);
    expect(localStorage.getItem("elnino.termsAccepted")).toBeNull();
    expect(localStorage.getItem("elnino.thirdPartySharingAccepted")).toBeNull();
  });

  it("asks for the tick when Continue is pressed first", async () => {
    renderLogin();
    fireEvent.click(await screen.findByText("Continue with Google"));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/accept/i)
    );
  });

  it("keeps Find a ride and the Terms link in-app", async () => {
    renderLogin();
    await screen.findByText("Continue with Google");
    expect(screen.getByText("Find a ride").getAttribute("href")).toBe("/");
    const terms = screen.getByText(/Terms & Conditions/);
    expect(terms.getAttribute("href")).toBe("/terms");
    expect(terms.getAttribute("target")).toBeNull();
  });
});
