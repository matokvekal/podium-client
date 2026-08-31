/**
 * "Share event" bottom sheet — a QR code and the plain join URL for one event, opened from
 * the organizer's card on EventDetailPage. Scanning the QR lands on JoinPage.tsx's
 * `/join/:code` route, which already looks the code up and skips straight to "enter a bib"
 * (see JoinPage.tsx's own doc comment: "the QR code encodes the second form"). Nothing new
 * server-side is needed — the QR is just a picture of a URL the app already handles.
 *
 * QR encoding happens entirely in the browser (the `qrcode` package, no network call) —
 * consistent with this app's offline-first bent elsewhere (IndexedDB event cache, local dev
 * sign-in). Native share (`navigator.share`) is used when the browser offers it; otherwise a
 * plain "Copy link" button covers the same case.
 */

import { Check, Copy, Share2, X } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { config } from "../lib/config";
import styles from "./ShareEventSheet.module.css";

interface ShareEventSheetProps {
  eventName: string;
  eventCode: string;
  onClose: () => void;
}

export function ShareEventSheet({ eventName, eventCode, onClose }: ShareEventSheetProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Always the production origin (config.shareBaseUrl) — a shared link / printed QR must open
  // the real app, never a localhost dev server.
  const joinUrl = `${config.shareBaseUrl}/join/${encodeURIComponent(eventCode)}`;

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

  async function copyLink() {
    await navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function nativeShare() {
    await navigator.share({
      title: eventName,
      text: `Join ${eventName} on El Niño Move`,
      url: joinUrl,
    });
  }

  return (
    <>
      <div className={styles.sheetOverlay} onClick={onClose} aria-hidden="true" />
      <div className={`${styles.sheet} ${styles.sheetOpen}`}>
        <div className={styles.sheetHeader}>
          <h2 style={{ margin: 0 }}>Share event</h2>
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
          <div className={styles.qrWrap}>
            {qrDataUrl ? (
              <img src={qrDataUrl} alt={`QR code to join ${eventName}`} width={240} height={240} />
            ) : (
              <div className={styles.qrPlaceholder}>
                <span className="spinner" aria-hidden="true" />
              </div>
            )}
          </div>

          <div className={styles.linkRow}>
            <code className={styles.link}>{joinUrl}</code>
            <button
              type="button"
              className="button button--quiet"
              onClick={copyLink}
              aria-label="Copy link"
            >
              {copied ? (
                <Check width={16} height={16} aria-hidden="true" />
              ) : (
                <Copy width={16} height={16} aria-hidden="true" />
              )}
            </button>
          </div>

          {typeof navigator.share === "function" && (
            <button type="button" className="button" onClick={nativeShare}>
              <Share2 width={16} height={16} aria-hidden="true" style={{ marginRight: 6 }} />
              Share
            </button>
          )}

          <p className="muted" style={{ fontSize: "0.85rem" }}>
            Anyone who scans this or opens the link can find and join {eventName} with code{" "}
            {eventCode}.
          </p>
        </div>
      </div>
    </>
  );
}
