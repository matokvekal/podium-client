/**
 * Ride chat — one shared text conversation per ride.
 *
 * Route:   /events/:eventId/chat   (RequireAuth — App.tsx)
 * Opened:  the chat icon on a ride card or on the ride page (app/RideChatButton.tsx), and from
 *          History the same way: a finished ride's chat stays readable.
 * Loads:   GET /events/:eventId (the ride's name for the header) and
 *          GET /events/:eventId/chat (the whole history — the server caps a chat at 500).
 * Polls:   every 30 s while the tab is visible, GET /events/:eventId/chat?afterId=<newest id>,
 *          so an open chat downloads each message once. No sockets.
 * Sends:   POST /events/:eventId/chat { text }. The sent message is shown the moment the server
 *          answers, not on the next poll. A failed send keeps the typed text in the box.
 * Unread:  opening / reading marks the newest id as read (store/rideChatStore.ts). No message
 *          is ever stored on the device.
 *
 * NOT PRIVATE, and it says so: every rider on the ride and its organizers can read it. The
 * server checks who may read and write on every request ("event:chat" in the server's
 * authz/policy.ts); this page only renders the answer.
 */

import { ArrowLeft, SendHorizontal, Users } from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError, apiRequest } from "../lib/api-client";
import {
  DEFAULT_RIDE_CHAT_LIMITS,
  formatChatTime,
  latestRideChatId,
  mergeRideChatMessages,
  RIDE_CHAT_POLL_MS,
  type RideChatLimits,
  type RideChatMessage,
  type RideChatPage as RideChatPageData,
  rideChatTextProblem,
} from "../lib/ride-chat";
import { detectTextDirection } from "../lib/text-direction";
import { useRideChatStore } from "../store/rideChatStore";
import styles from "./RideChatPage.module.css";

type LoadState = "loading" | "ready" | "no-access" | "not-found" | "error";

/** What to tell the rider when a send fails. The typed text always stays in the box. */
export function sendErrorText(err: unknown, limits: RideChatLimits): string {
  if (err instanceof ApiError) {
    if (err.status === 409) {
      return `This ride's chat is full (${limits.maxMessages} messages). No more messages can be added.`;
    }
    if (err.status === 400) {
      return `A message can be up to ${limits.maxMessageLength} characters.`;
    }
    if (err.status === 403 || err.status === 404) {
      return "Only riders on this ride can write in its chat.";
    }
    if (err.status === 429) return "You're sending very fast — wait a moment and try again.";
  }
  return "Couldn't send. Check your connection and try again.";
}

export function RideChatPage() {
  const { eventId = "" } = useParams();
  const { profile } = useAuth();
  const myId = profile?.id ?? null;
  const markRead = useRideChatStore((s) => s.markRead);

  const [rideName, setRideName] = useState<string | null>(null);
  const [messages, setMessages] = useState<RideChatMessage[]>([]);
  const [limits, setLimits] = useState<RideChatLimits>(DEFAULT_RIDE_CHAT_LIMITS);
  const [state, setState] = useState<LoadState>("loading");
  const [attempt, setAttempt] = useState(0);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // Newest id on screen, read by the poller without re-creating its timer on every message.
  const latestRef = useRef(0);
  latestRef.current = latestRideChatId(messages);

  // The ride's name for the header. Best effort — the chat works without it.
  useEffect(() => {
    let cancelled = false;
    apiRequest<{ name?: string }>(`/events/${eventId}`)
      .then((ride) => {
        if (!cancelled && ride?.name) setRideName(ride.name);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  // Initial / retry load: the whole history.
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is a deliberate re-run trigger for Try again.
  useEffect(() => {
    let cancelled = false;
    setState("loading");
    apiRequest<RideChatPageData>(`/events/${eventId}/chat`)
      .then((page) => {
        if (cancelled) return;
        setMessages(page.messages ?? []);
        if (page.limits) setLimits(page.limits);
        setState("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403) setState("no-access");
        else if (err instanceof ApiError && err.status === 404) setState("not-found");
        else setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, attempt]);

  // Poll for NEW messages only, every ~30 s while the chat is open and the tab visible.
  const poll = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const page = await apiRequest<RideChatPageData>(
        `/events/${eventId}/chat?afterId=${latestRef.current}`,
      );
      if (page.messages?.length)
        setMessages((current) => mergeRideChatMessages(current, page.messages));
    } catch {
      // A missed poll is not worth a banner — the next one, or the rider's own send, catches up.
    }
  }, [eventId]);

  useEffect(() => {
    if (state !== "ready") return;
    const timer = window.setInterval(() => void poll(), RIDE_CHAT_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [state, poll]);

  // Reading = the newest message on screen while the chat is open.
  const latestId = latestRideChatId(messages);
  useEffect(() => {
    if (state === "ready" && latestId > 0) markRead(eventId, latestId);
  }, [state, latestId, eventId, markRead]);

  // Newest at the bottom: follow new messages down, unless the rider has scrolled up to read.
  const messageCount = messages.length;
  const followRef = useRef(true);
  useEffect(() => {
    if (messageCount > 0 && followRef.current) endRef.current?.scrollIntoView({ block: "end" });
  }, [messageCount]);

  useEffect(() => {
    const onScroll = () => {
      const el = document.scrollingElement ?? document.documentElement;
      followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const problem = rideChatTextProblem(text, limits.maxMessageLength);
  const tooLong = problem === "too-long";
  const full = messages.length >= limits.maxMessages;

  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (sending || problem || full) return;
    setSending(true);
    setSendError(null);
    try {
      const message = await apiRequest<RideChatMessage>(`/events/${eventId}/chat`, {
        method: "POST",
        body: { text: text.trim() },
      });
      followRef.current = true;
      setMessages((current) => mergeRideChatMessages(current, [message]));
      setText("");
    } catch (err) {
      // The text stays exactly as typed, so a retry is one tap.
      setSendError(sendErrorText(err, limits));
    } finally {
      setSending(false);
    }
  }

  // Enter sends on a keyboard; Shift+Enter is a new line. A phone's return key is a new line
  // (there is a Send button right beside it).
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      !e.nativeEvent.isComposing &&
      window.matchMedia("(pointer: fine)").matches
    ) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Link to={`/events/${eventId}`} className={styles.back} aria-label="Back to the ride">
          <ArrowLeft width={20} height={20} aria-hidden="true" />
        </Link>
        <div className={styles.headerText}>
          <h1 className={styles.title}>{rideName ?? "Ride"}</h1>
          <span className={styles.subtitle}>Ride Chat</span>
        </div>
      </header>

      <p className={styles.notice}>
        <Users width={14} height={14} aria-hidden="true" />
        Messages are visible to all riders in this ride. This chat is not private.
      </p>

      {state === "loading" && (
        <p className={styles.centered} role="status">
          <span className="spinner" aria-hidden="true" /> Loading messages…
        </p>
      )}

      {state === "error" && (
        <p className={`banner banner--error ${styles.centered}`} role="alert">
          Couldn't load the chat.{" "}
          <button
            type="button"
            className="button button--quiet"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Retry
          </button>
        </p>
      )}

      {state === "no-access" && (
        <p className={`banner ${styles.centered}`} role="alert">
          This chat is for the riders on this ride. Join the ride to read and write here.{" "}
          <Link to={`/events/${eventId}`}>Open the ride</Link>
        </p>
      )}

      {state === "not-found" && (
        <p className={`banner ${styles.centered}`} role="alert">
          This ride could not be found. <Link to="/">Back to my rides</Link>
        </p>
      )}

      {state === "ready" && (
        <div className={styles.list} ref={listRef} aria-live="polite">
          {messages.length === 0 && (
            <p className={`muted ${styles.centered}`}>No messages yet. Say hi to the group.</p>
          )}
          {messages.map((m) => {
            const mine = myId != null && m.userId === myId;
            return (
              <article key={m.id} className={styles.message} data-mine={mine || undefined}>
                <div className={styles.meta}>
                  <span className={styles.author}>
                    {mine ? "You" : m.userName?.trim() || "Rider"}
                    {m.isOrganizer && <span className={styles.role}>Organizer</span>}
                  </span>
                  <time className={styles.time} dateTime={m.createdAt}>
                    {formatChatTime(m.createdAt)}
                  </time>
                </div>
                {/* Plain text only — React escapes it, and nothing here is ever parsed as HTML. */}
                <p className={styles.bubble} dir={detectTextDirection(m.text)}>
                  {m.text}
                </p>
              </article>
            );
          })}
          <div ref={endRef} />
        </div>
      )}

      {state === "ready" && (
        <form className={styles.composer} onSubmit={send}>
          {full && (
            <p className={styles.composerNote} role="status">
              This ride's chat has reached {limits.maxMessages} messages — no more can be added.
            </p>
          )}
          {sendError && (
            <p className={styles.composerError} role="alert">
              {sendError}
            </p>
          )}
          {tooLong && (
            <p className={styles.composerError} role="alert">
              A message can be up to {limits.maxMessageLength} characters ({text.trim().length}{" "}
              now).
            </p>
          )}
          <div className={styles.composerRow}>
            <textarea
              className={styles.input}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (sendError) setSendError(null);
              }}
              onKeyDown={onKeyDown}
              placeholder="Write a message..."
              rows={1}
              maxLength={limits.maxMessageLength + 200}
              disabled={full}
              aria-label="Message"
              dir="auto"
              enterKeyHint="send"
            />
            <button
              type="submit"
              className={styles.send}
              disabled={sending || problem !== null || full}
              aria-label="Send message"
            >
              {sending ? (
                <span className="spinner" aria-hidden="true" />
              ) : (
                <SendHorizontal width={20} height={20} aria-hidden="true" />
              )}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
