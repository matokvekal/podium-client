// Ride chat (server: sql/047, /events/:eventId/chat) — the pieces with no React in them, so the
// merge / unread / validation rules are testable on their own.
//
// THE DATABASE IS THE SOURCE OF TRUTH. This app never stores a chat's messages on the device:
// the only thing kept locally is, per ride, the id of the last message this rider has read
// (store/rideChatStore.ts, localStorage "podium.rideChatLastRead"). Opening a chat always loads
// it from the server; polling asks only for messages after the newest id already on screen.

/** One message as the server sends it. Identity, name, badge and time are all server-decided. */
export interface RideChatMessage {
  id: number;
  userId: number;
  userName: string | null;
  isOrganizer: boolean;
  text: string;
  createdAt: string;
}

export interface RideChatLimits {
  maxMessageLength: number;
  maxMessages: number;
}

/** GET /events/:eventId/chat's `data`. */
export interface RideChatPage {
  messages: RideChatMessage[];
  limits: RideChatLimits;
}

/** One row of GET /events/chat/unread. A ride the rider cannot chat in is simply absent. */
export interface RideChatSummary {
  rideId: string;
  latestId: number | null;
  unread: number;
}

/** Mirrors the server's V1 limits, for instant feedback before a request is made. The server
 *  still decides — its `limits` in each chat response override these. */
export const DEFAULT_RIDE_CHAT_LIMITS: RideChatLimits = {
  maxMessageLength: 500,
  maxMessages: 500,
};

/** How often an OPEN chat asks for new messages. */
export const RIDE_CHAT_POLL_MS = 30_000;

/** How often the ride list / ride page refreshes unread badges (one request for all rides). */
export const RIDE_CHAT_UNREAD_REFRESH_MS = 5 * 60_000;

/**
 * Add newly fetched messages to what is on screen: no duplicates (a poll can overlap a send
 * that already appended its own message), always in id order.
 */
export function mergeRideChatMessages(
  current: RideChatMessage[],
  incoming: RideChatMessage[],
): RideChatMessage[] {
  if (incoming.length === 0) return current;
  const byId = new Map(current.map((m) => [m.id, m]));
  let changed = false;
  for (const message of incoming) {
    if (!byId.has(message.id)) {
      byId.set(message.id, message);
      changed = true;
    }
  }
  if (!changed) return current;
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

/** The newest id on screen — the `afterId` for the next poll. 0 when there is none yet. */
export function latestRideChatId(messages: RideChatMessage[]): number {
  return messages.reduce((max, m) => (m.id > max ? m.id : max), 0);
}

export type RideChatTextProblem = "empty" | "too-long" | null;

/** The same rule the server applies to the trimmed text. */
export function rideChatTextProblem(
  text: string,
  maxLength = DEFAULT_RIDE_CHAT_LIMITS.maxMessageLength,
): RideChatTextProblem {
  const trimmed = text.trim();
  if (!trimmed) return "empty";
  if (trimmed.length > maxLength) return "too-long";
  return null;
}

/** "3", or "99+" once the server's capped count reaches it. */
export function unreadBadgeText(unread: number): string {
  return unread >= 100 ? "99+" : String(unread);
}

/** "06:42" today, "Tue 06:42" for an older message — a chat reads by time of day. */
export function formatChatTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return time;
  const day = date.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  return `${day} ${time}`;
}

/**
 * The query value for GET /events/chat/unread: "<rideId>:<lastReadId>,...". Capped at 100
 * rides, which is the server's own cap.
 */
export function buildUnreadQuery(rideIds: string[], lastRead: Record<string, number>): string {
  return rideIds
    .slice(0, 100)
    .map((id) => `${id}:${lastRead[id] ?? 0}`)
    .join(",");
}

/**
 * May this viewer open the ride's chat? The server's own answer ("event:chat" in the detail's
 * `capabilities`) when it sent one; otherwise the same rule from the detail's own fields —
 * the organizer, or a rider whose place is confirmed. The server re-checks on every request,
 * so this only decides whether the icon is drawn.
 */
export function canOpenRideChat(detail: {
  capabilities?: string[];
  isOwner?: boolean;
  myParticipant?: { registrationStatus: string } | null;
}): boolean {
  if (detail.capabilities) return detail.capabilities.includes("event:chat");
  if (detail.isOwner) return true;
  const status = detail.myParticipant?.registrationStatus;
  return status === "registered" || status === "approved";
}
