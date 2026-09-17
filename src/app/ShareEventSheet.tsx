/**
 * "Share event" bottom sheet — a QR code and the plain join URL for one event, opened from
 * the organizer's card on EventDetailPage. Scanning the QR lands on JoinPage.tsx's
 * `/join/:code` route, which already looks the code up and skips straight to "enter a bib"
 * (see JoinPage.tsx's own doc comment: "the QR code encodes the second form"). Nothing new
 * server-side is needed — the QR is just a picture of a URL the app already handles.
 *
 * QR encoding happens entirely in the browser (the `qrcode` package, no network call) —
 * consistent with this app's offline-first bent elsewhere (IndexedDB event cache, local dev
 * sign-in). Native share (`navigator.share`) is used when the browser offers it; otherwise the
 * copy buttons cover the same case.
 *
 * What gets sent is a real invitation — the ride's name, day, time and place, built by
 * lib/share-invite.ts and previewed in the sheet so the organizer sees exactly what lands in
 * the chat. It replaced "Join <name> on El Niño Move", which told the reader nothing they
 * needed in order to say yes.
 *
 * Two copy actions, because they answer different questions: "Copy invitation" is the whole
 * message for pasting into a chat, "Copy link" is the bare URL for a form, a poster or a
 * calendar entry.
 *
 * ONE LINK FOR SEVERAL RIDES (`linkedRides`, server sql/037)
 *   When this ride is connected to the organizer's other rides that day, this sheet offers
 *   TWO links and the organizer picks which one they are sending:
 *
 *     • all the rides    -> /share/<codeA>-<codeB>, which opens the chooser ("which one are
 *                           you riding?"). The default, because it is why they connected them.
 *     • only this ride   -> /join/<code>, exactly the link a ride shared on its own gets.
 *
 *   Both are real, and both are needed on the same day: the group link goes into the club
 *   chat, and the single-ride link goes to the person who is already on the short ride and
 *   must not be asked to choose again. Deciding for the organizer — which this sheet used to
 *   do, always handing out the group link — made the second case impossible.
 *
 *   The QR, the previewed invitation, the copy buttons and the native share all follow the
 *   chosen link, so what the organizer sees is what they send.
 *
 *   With no `linkedRides` there is no choice to make and every byte of this sheet's output is
 *   what it always was — a ride shared on its own must not change at all.
 */

import { Bike, Check, Copy, Layers, Link2, Share2, X } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { config } from "../lib/config";
import { shareLinkPath } from "../lib/link-group";
import {
  shareInviteMessage,
  shareInviteMessageMulti,
  shareInviteTitle,
  shareInviteTitleMulti,
} from "../lib/share-invite";
import styles from "./ShareEventSheet.module.css";

interface ShareEventSheetProps {
  eventName: string;
  eventCode: string;
  /** UTC ISO. Optional so a caller that genuinely has no start time still works — the
   *  invitation simply drops its date line rather than printing a placeholder. */
  startsAt?: string | null;
  location?: string | null;
  /**
   * The OTHER rides sharing this ride's link, from EventDetail.linkedRides. Empty or absent for
   * the normal case, and then this sheet behaves exactly as it always has.
   *
   * Codes, not ids: the /share URL is built from codes so it stays readable, and the sibling
   * names/times below are only used to write the invitation.
   */
  linkedRides?: { code: string; name: string; startsAt: string | null }[];
  onClose: () => void;
}

export function ShareEventSheet({
  eventName,
  eventCode,
  startsAt,
  location,
  linkedRides,
  onClose,
}: ShareEventSheetProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<"invite" | "link" | null>(null);

  const siblings = linkedRides ?? [];
  const connected = siblings.length > 0;

  /**
   * Which of the two links this sheet is currently handing out.
   *
   * Defaults to "all" for a connected ride: the organizer connected these rides so that one
   * link would cover them, so that is what they are most likely sending. "this" is one tap
   * away and changes everything below it.
   */
  const [mode, setMode] = useState<"all" | "this">("all");
  const isGroup = connected && mode === "all";
  const rideCount = siblings.length + 1;

  // Always the production origin (config.shareBaseUrl) — a shared link / printed QR must open
  // the real app, never a localhost dev server.
  //
  // A connected ride links to the CHOOSER (/share/<a>-<b>), not to one of its rides: sending a
  // link that lands on the long ride would quietly pick for the reader. This ride's own code
  // leads, so the link reads as "this ride, plus the others".
  const joinUrl = isGroup
    ? `${config.shareBaseUrl}${shareLinkPath([eventCode, ...siblings.map((ride) => ride.code)])}`
    : `${config.shareBaseUrl}/join/${encodeURIComponent(eventCode)}`;

  /**
   * The QR encodes the same URL plus `?via=qr`; the link above stays clean.
   *
   * That one parameter is the only thing that can tell a scan from a forwarded link. Both
   * otherwise land on exactly the same /join/:code, yet they are different situations — a link
   * was sent TO you, a QR is something you walked up to and chose to point a camera at — and
   * the event page greets each differently (lib/invite-greeting.ts). Marking the QR rather than
   * the link is what makes this work for the phone's own camera app, which is how most people
   * actually scan and which the in-app scanner never sees.
   *
   * Inert everywhere else: JoinPage reads the code from the path, and extractCode() parses only
   * the pathname, so the parameter never reaches the server or corrupts a scanned code.
   */
  const qrUrl = `${joinUrl}?via=qr`;

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(qrUrl, { width: 240, margin: 1 }).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [qrUrl]);

  // This ride first, then the others — the same order as the link, and the order the chooser
  // shows them in once it sorts by start time. Keyed on the `linkedRides` PROP rather than on
  // the `siblings` array derived from it, whose identity changes every render.
  const groupRides = useMemo(
    () => [{ name: eventName, startsAt: startsAt ?? null }, ...(linkedRides ?? [])],
    [eventName, startsAt, linkedRides],
  );

  // The invitation as the recipient will read it. Two shapes of the same message: the clipboard
  // has no separate URL field so its copy carries the link inline, while navigator.share passes
  // `url` on its own — putting it in both would print the link twice in the chat bubble.

  const messageForChat = useMemo(
    () =>
      isGroup
        ? shareInviteMessageMulti({ rides: groupRides, location })
        : shareInviteMessage({ eventName, startsAt, location }),
    [isGroup, groupRides, eventName, startsAt, location],
  );
  const messageWithLink = useMemo(
    () =>
      isGroup
        ? shareInviteMessageMulti({ rides: groupRides, location, url: joinUrl })
        : shareInviteMessage({ eventName, startsAt, location, url: joinUrl }),
    [isGroup, groupRides, eventName, startsAt, location, joinUrl],
  );

  function flash(which: "invite" | "link") {
    setCopied(which);
    setTimeout(() => setCopied(null), 1500);
  }

  async function copyInvite() {
    await navigator.clipboard.writeText(messageWithLink);
    flash("invite");
  }

  async function copyLink() {
    await navigator.clipboard.writeText(joinUrl);
    flash("link");
  }

  async function nativeShare() {
    await navigator.share({
      title: isGroup ? shareInviteTitleMulti(groupRides.length) : shareInviteTitle(eventName),
      text: messageForChat,
      url: joinUrl,
    });
  }

  return (
    <>
      <div className={styles.sheetOverlay} onClick={onClose} aria-hidden="true" />
      <div className={`${styles.sheet} ${styles.sheetOpen}`}>
        <div className={styles.sheetHeader}>
          <h2 style={{ margin: 0 }}>
            {connected ? (isGroup ? `Share ${rideCount} rides` : `Share ${eventName}`) : "Share event"}
          </h2>
          <button
            type="button"
            className="button button--quiet"
            onClick={onClose}
            aria-label="Close"
          >
            <X width={18} height={18} aria-hidden="true" />
          </button>
        </div>
        <div className={`stack ${styles.sheetBody}`}>
          {/* The choice, first: everything under it — the QR, the invitation, both copy
              buttons — is whichever link is selected here. Two plain buttons rather than a
              dropdown, because there are exactly two answers and the organizer should be able
              to see both without opening anything. */}
          {connected && (
            <div className={styles.modeBlock}>
              {/* A real fieldset rather than role="group": the two buttons are one choice,
                  and the element that says so natively needs no ARIA. Its default chrome is
                  reset in the stylesheet. */}
              <fieldset className={styles.modeRow} aria-label="What this link opens">
                <button
                  type="button"
                  className={styles.modeButton}
                  data-active={mode === "all"}
                  aria-pressed={mode === "all"}
                  onClick={() => setMode("all")}
                >
                  <Layers width={15} height={15} aria-hidden="true" />
                  All {rideCount} rides
                </button>
                <button
                  type="button"
                  className={styles.modeButton}
                  data-active={mode === "this"}
                  aria-pressed={mode === "this"}
                  onClick={() => setMode("this")}
                >
                  <Bike width={15} height={15} aria-hidden="true" />
                  Only this ride
                </button>
              </fieldset>
              <p className={styles.modeHint}>
                {isGroup
                  ? `Riders open one link, see all ${rideCount} rides and choose the one they're riding.`
                  : `Riders go straight to ${eventName} — nothing to choose.`}
              </p>
            </div>
          )}

          <div className={styles.qrWrap}>
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={
                  isGroup
                    ? `QR code to choose between ${groupRides.length} rides`
                    : `QR code to join ${eventName}`
                }
                width={240}
                height={240}
              />
            ) : (
              <div className={styles.qrPlaceholder}>
                <span className="spinner" aria-hidden="true" />
              </div>
            )}
          </div>

          {/* What the recipient will actually read, shown before it is sent. An organizer
              about to post this into a group chat should not have to send it to themselves
              first to find out what it says. */}
          <div className={styles.preview}>
            <span className={styles.previewLabel}>They'll receive</span>
            <p className={styles.previewText}>{messageForChat}</p>
          </div>

          {typeof navigator.share === "function" && (
            <button type="button" className="button" onClick={nativeShare}>
              <Share2 width={16} height={16} aria-hidden="true" style={{ marginRight: 6 }} />
              Share invitation
            </button>
          )}

          <div className={styles.copyRow}>
            <button type="button" className="button button--quiet" onClick={copyInvite}>
              {copied === "invite" ? (
                <Check width={16} height={16} aria-hidden="true" />
              ) : (
                <Copy width={16} height={16} aria-hidden="true" />
              )}
              {copied === "invite" ? "Copied" : "Copy invitation"}
            </button>
            <button type="button" className="button button--quiet" onClick={copyLink}>
              {copied === "link" ? (
                <Check width={16} height={16} aria-hidden="true" />
              ) : (
                <Link2 width={16} height={16} aria-hidden="true" />
              )}
              {copied === "link" ? "Copied" : "Copy link"}
            </button>
          </div>

          {/* The single-ride wording names a code, which would contradict a group link: a
              /share link belongs to no one code, and telling someone to "join Long loop with
              code 19092026A" quietly picks one of the two rides for them. */}
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            {isGroup ? (
              <>
                Anyone who scans this or opens the link can choose between your {groupRides.length}{" "}
                rides and join the one they want.
              </>
            ) : (
              <>
                Anyone who scans this or opens the link can find and join {eventName} with code{" "}
                {eventCode}.
              </>
            )}
          </p>
        </div>
      </div>
    </>
  );
}
