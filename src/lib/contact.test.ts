import { describe, expect, it } from "vitest";
import { buildContactMailto, CONTACT_EMAIL, CONTACT_TOPICS, type ContactContext } from "./contact";

const CONTEXT: ContactContext = {
  appVersion: "0.1.15",
  page: "/events/c421356f",
  viewport: "390×844",
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/605.1.15",
};

const topic = (id: string) => {
  const found = CONTACT_TOPICS.find((t) => t.id === id);
  if (!found) throw new Error(`no topic ${id}`);
  return found;
};

/** mailto bodies are percent-encoded; decode before asserting on the wording. */
function bodyOf(mailto: string): string {
  const body = new URL(mailto).searchParams.get("body");
  return decodeURIComponent(body ?? "");
}
function subjectOf(mailto: string): string {
  return new URL(mailto).searchParams.get("subject") ?? "";
}

describe("buildContactMailto", () => {
  it("addresses the mail to the contact address", () => {
    const mailto = buildContactMailto(topic("bug"), CONTEXT);
    expect(mailto.startsWith(`mailto:${CONTACT_EMAIL}?`)).toBe(true);
  });

  it("names the app in the subject, so it is sortable in an inbox", () => {
    expect(subjectOf(buildContactMailto(topic("bug"), CONTEXT))).toBe("El Niño Ride — Bug report");
    expect(subjectOf(buildContactMailto(topic("idea"), CONTEXT))).toBe(
      "El Niño Ride — Feature request",
    );
  });

  it("percent-encodes the subject, so the em dash survives the URL", () => {
    // An unencoded "—" or "#" in a mailto truncates the draft at that character in some
    // clients — the reason both fields go through encodeURIComponent.
    const raw = buildContactMailto(topic("bug"), CONTEXT);
    expect(raw).not.toContain("El Niño Ride — Bug report");
    expect(subjectOf(raw)).toContain("—");
  });

  it("prompts for what a reply actually needs", () => {
    const body = bodyOf(buildContactMailto(topic("bug"), CONTEXT));
    expect(body).toContain("What happened:");
    expect(body).toContain("What you expected instead:");
    // Somewhere to type under each prompt, rather than a wall of labels.
    expect(body).toContain("What happened:\n\n");
  });

  it("puts version, screen and browser in a bug report", () => {
    const body = bodyOf(buildContactMailto(topic("bug"), CONTEXT));
    expect(body).toContain("App version: 0.1.15");
    expect(body).toContain("Screen: /events/c421356f");
    expect(body).toContain("Window: 390×844");
    expect(body).toContain("iPhone");
  });

  it("leaves diagnostics out of an idea or a question", () => {
    for (const id of ["idea", "question"]) {
      const body = bodyOf(buildContactMailto(topic(id), CONTEXT));
      expect(body).not.toContain("App version:");
      expect(body).not.toContain("Browser:");
    }
  });

  it("never carries anything about who the sender is", () => {
    // The draft is read and edited by the sender before it goes, so it must contain nothing
    // they would not choose to send. Context is version/route/viewport/browser and no more.
    const body = bodyOf(buildContactMailto(topic("bug"), CONTEXT));
    for (const leak of ["token", "Bearer", "podium.", "userId", "@gmail.com"]) {
      expect(body).not.toContain(leak);
    }
  });

  it("survives a page path carrying characters that would break the URL", () => {
    const mailto = buildContactMailto(topic("bug"), { ...CONTEXT, page: "/events/a b&c=d#e" });
    expect(() => new URL(mailto)).not.toThrow();
    expect(bodyOf(mailto)).toContain("Screen: /events/a b&c=d#e");
  });
});

describe("CONTACT_TOPICS", () => {
  it("offers the genuinely different kinds of message", () => {
    expect(CONTACT_TOPICS.map((t) => t.id)).toEqual(["bug", "idea", "question", "organize"]);
  });

  it("the organizer-access request carries no diagnostics and asks what enabling it needs", () => {
    const body = bodyOf(buildContactMailto(topic("organize"), CONTEXT));
    expect(body).not.toContain("App version:");
    expect(body).toContain("Your name or riding group:");
    expect(subjectOf(buildContactMailto(topic("organize"), CONTEXT))).toBe(
      "El Niño Ride — Organizer access request",
    );
  });

  it("gives every topic something to say and something to ask", () => {
    for (const t of CONTACT_TOPICS) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.note.length).toBeGreaterThan(0);
      expect(t.prompts.length).toBeGreaterThan(0);
    }
  });
});
