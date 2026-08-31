// Reaching a human. The address, the three kinds of message, and the mailto draft each one
// opens — kept pure and out of the sheet so the wording and the encoding are testable, the
// same split share-invite.ts and invite-greeting.ts use.

/** Where feedback goes. One address, one place to look. */
export const CONTACT_EMAIL = "tipusharim@gmail.com";

export type ContactTopicId = "bug" | "idea" | "question";

export interface ContactTopic {
  id: ContactTopicId;
  label: string;
  note: string;
  /** Becomes the mail subject, after the app name. */
  subject: string;
  /** Written into the draft so a reply arrives with the facts already in it, instead of
   *  starting a round trip to ask for them. */
  prompts: string[];
  /** Only a bug report carries the technical context — an idea does not need a user agent. */
  withDiagnostics?: boolean;
}

/**
 * Three ways in, not one "Contact us".
 *
 * They are genuinely different jobs — something is broken, something is missing, something is
 * unclear — and collapsing them into a single box makes every message open with the sender
 * explaining which kind it is. Splitting them also lets each draft ask for what that kind of
 * message actually needs.
 */
export const CONTACT_TOPICS: ContactTopic[] = [
  {
    id: "bug",
    label: "Something's broken",
    note: "A screen misbehaved, or the app did something you didn't expect.",
    subject: "Bug report",
    prompts: ["What happened:", "What you expected instead:", "What you were doing at the time:"],
    withDiagnostics: true,
  },
  {
    id: "idea",
    label: "I have an idea",
    note: "Something missing that would make your rides easier to run or to join.",
    subject: "Feature request",
    prompts: ["What you'd like to be able to do:", "Why it would help:"],
  },
  {
    id: "question",
    label: "I have a question",
    note: "Anything at all — how something works, or something that isn't clear.",
    subject: "Question",
    prompts: ["Your question:"],
  },
];

/**
 * The technical context a reporter cannot reasonably be asked to find for themselves, and the
 * first thing needed to reproduce anything.
 *
 * Deliberately narrow — version, screen, viewport, browser. No user id, no email, no tokens,
 * nothing about who they are or what they have joined. This ends up in a draft the sender
 * reads in full and can edit before sending, so it must contain nothing they would not choose
 * to send themselves.
 */
export interface ContactContext {
  appVersion: string;
  /** The path they were on — the route, never a full URL with query or hash, which could
   *  carry a join code or another event's id. */
  page: string;
  viewport: string;
  userAgent: string;
}

function diagnosticsBlock(context: ContactContext): string[] {
  return [
    "",
    "---",
    "Sent from El Niño Move. The lines below help us track the problem down:",
    `App version: ${context.appVersion}`,
    `Screen: ${context.page}`,
    `Window: ${context.viewport}`,
    `Browser: ${context.userAgent}`,
  ];
}

/**
 * A mailto: draft, not a form.
 *
 * A form needs an endpoint, a spam defence and somewhere to put the messages; this app has
 * none of those, and building them for a feedback link would be a server project. mailto costs
 * nothing, works with no network, and puts the thread in a real inbox where it can be replied
 * to. Its one weakness — doing nothing at all on a machine with no mail client — is covered by
 * showing the address in full next to it.
 */
export function buildContactMailto(topic: ContactTopic, context: ContactContext): string {
  const body = [
    "",
    // A blank line under each prompt, so the draft opens with somewhere to type rather than a
    // wall of labels.
    ...topic.prompts.flatMap((prompt) => [prompt, "", ""]),
    ...(topic.withDiagnostics ? diagnosticsBlock(context) : []),
  ].join("\n");

  const subject = encodeURIComponent(`El Niño Move — ${topic.subject}`);
  return `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${encodeURIComponent(body)}`;
}
