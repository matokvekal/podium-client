/**
 * The Share button on Find Tracks: Facebook, the device's own share sheet, or copy the link.
 *
 * WHAT IS SHARED is the canonical /findtracks/<country>/<type> link for the filters currently on
 * screen (lib/find-tracks-url.ts), never window.location — a rider who has scrolled, opened a
 * panel or arrived through the old /routes address should still send a clean link. It works
 * signed out: the page is public and so is the link.
 *
 * FACEBOOK gets the plain sharer URL. Facebook builds the card from the link's own HTML, which
 * the build generates per country/discipline (vite-plugin-findtracks-og.ts), so nothing but the
 * URL travels here.
 *
 * The panel reuses the Sort panel's chrome (TrackGallerySheet.module.css) so it opens the same
 * way — a bottom sheet on a phone, a floating panel on a wide screen.
 */

import { Check, Copy, Share2, X } from "lucide-react";
import { useState } from "react";
import {
  buildFindTracksPath,
  type FindTracksFacets,
  findTracksHeadline,
  findTracksTitle,
} from "../lib/find-tracks-url";
import sheet from "./TrackGallerySheet.module.css";

/** lucide-react carries no brand marks, so the Facebook "f" is drawn here. */
function FacebookMark({ width, height, style }: { width: number; height: number; style?: object }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      style={style}
    >
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

export function ShareTracksButton({ facets }: { facets: FindTracksFacets }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const url = `${window.location.origin}${buildFindTracksPath(facets)}`;
  const headline = findTracksHeadline(facets);

  function shareToFacebook() {
    const target = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
    window.open(target, "_blank", "noopener,noreferrer,width=600,height=500");
    setOpen(false);
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: findTracksTitle(facets), text: headline, url });
      setOpen(false);
    } catch {
      // The rider dismissed the share sheet — not an error, and the panel stays for another try.
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (insecure context / denied): show the link to copy by hand instead.
      window.prompt("Copy this link", url);
    }
  }

  return (
    <>
      <button
        type="button"
        className={sheet.iconBtn}
        onClick={() => setOpen(true)}
        aria-label="Share this page"
        aria-haspopup="dialog"
      >
        <Share2 className={sheet.iconGlyph} aria-hidden="true" />
        <span className={sheet.iconLabel}>Share</span>
      </button>

      {open && (
        <div className={sheet.panelOverlay} onClick={() => setOpen(false)} aria-hidden="true" />
      )}

      <div
        className={open ? `${sheet.panel} ${sheet.panelOpen}` : sheet.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Share tracks"
      >
        <div className={sheet.panelHeader}>
          <h3 className={sheet.panelTitle}>Share {headline}</h3>
          <button
            type="button"
            className="button button--quiet"
            onClick={() => setOpen(false)}
            aria-label="Close share"
          >
            <X width={18} height={18} aria-hidden="true" />
          </button>
        </div>
        <div className={sheet.panelBody}>
          <button type="button" className={sheet.sortOption} onClick={shareToFacebook}>
            <FacebookMark width={16} height={16} style={{ marginInlineEnd: 8 }} />
            Share on Facebook
          </button>
          {typeof navigator.share === "function" && (
            <button type="button" className={sheet.sortOption} onClick={nativeShare}>
              <Share2 width={16} height={16} aria-hidden="true" style={{ marginInlineEnd: 8 }} />
              Share…
            </button>
          )}
          <button type="button" className={sheet.sortOption} onClick={copyLink}>
            {copied ? (
              <Check width={16} height={16} aria-hidden="true" style={{ marginInlineEnd: 8 }} />
            ) : (
              <Copy width={16} height={16} aria-hidden="true" style={{ marginInlineEnd: 8 }} />
            )}
            {copied ? "Link copied" : "Copy link"}
          </button>
          <p className="muted" style={{ fontSize: "0.85rem", wordBreak: "break-all" }}>
            {url}
          </p>
        </div>
      </div>
    </>
  );
}
