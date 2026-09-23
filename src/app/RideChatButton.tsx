/**
 * The ride chat button — on a ride card and on the ride page: a purple circle with a chat
 * bubble and a count badge (red unread count, or a quiet 0). Tapping it opens
 * /events/:eventId/chat.
 *
 * It reads its count from store/rideChatStore.ts and fetches NOTHING itself: the list or page
 * that renders it refreshes every ride's badge in one request (useRideChatUnread), so a list of
 * twenty cards is one request every five minutes, not twenty.
 *
 * Inside a ride card the whole card is a <Link>, so the click is stopped here and navigates
 * itself — a tap on the icon must open the chat, not the ride.
 */

import { MessageCircle } from "lucide-react";
import type { MouseEvent } from "react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { RIDE_CHAT_UNREAD_REFRESH_MS, unreadBadgeText } from "../lib/ride-chat";
import { useRideChatStore } from "../store/rideChatStore";
import styles from "./RideChatButton.module.css";

export function RideChatButton({
  rideId,
  variant = "card",
}: {
  rideId: string;
  /** "card" matches the card's 30px heart; "page" is the ride page's 32px hero size. */
  variant?: "card" | "page";
}) {
  const navigate = useNavigate();
  const unread = useRideChatStore((s) => s.summaries[rideId]?.unread ?? 0);

  function open(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/events/${rideId}/chat`);
  }

  const label = unread > 0 ? `Ride chat, ${unread} unread` : "Ride chat, no new messages";

  return (
    <button
      type="button"
      className={variant === "page" ? `${styles.btn} ${styles.btnPage}` : styles.btn}
      onClick={open}
      aria-label={label}
      title={label}
    >
      <MessageCircle className={styles.icon} fill="currentColor" aria-hidden="true" />
      {/* Always drawn — red with the count when there is something new, a quiet 0 otherwise
          (see the stylesheet). key=unread replays the pop when a new message lands. */}
      <span
        key={unread}
        className={styles.badge}
        data-zero={unread === 0 || undefined}
        aria-hidden="true"
      >
        {unreadBadgeText(unread)}
      </span>
    </button>
  );
}

/**
 * Keep unread badges fresh for these rides: once now, then every ~5 minutes while the tab is
 * visible. ONE request per refresh for all of them. Pass [] (or enabled=false) when signed out.
 */
export function useRideChatUnread(rideIds: string[], enabled: boolean) {
  const refreshUnread = useRideChatStore((s) => s.refreshUnread);
  // A stable key, so a new array with the same rides does not restart the timer.
  const key = [...new Set(rideIds)].sort().join(",");

  useEffect(() => {
    if (!enabled || !key) return;
    const ids = key.split(",");
    const refresh = () => {
      if (document.visibilityState === "visible") void refreshUnread(ids);
    };
    refresh();
    const timer = window.setInterval(refresh, RIDE_CHAT_UNREAD_REFRESH_MS);
    // Coming back to the tab after a while counts as a refresh point too.
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [key, enabled, refreshUnread]);
}
