/**
 * The description shown directly on a LOCKED (PROMOTE) event card. The card itself does not
 * navigate, but an external link inside the text (e.g. the municipality's registration page)
 * must stay clickable — so each link stops the click from reaching the card and opens in a new
 * tab. Plain React nodes only; no raw HTML.
 */

import { splitDescriptionLinks } from "../lib/promote";
import { detectTextDirection } from "../lib/text-direction";
import styles from "./EventCard.module.css";

export function PromoteDescription({ text }: { text: string }) {
  return (
    <p className={styles.promoteDescription} dir={detectTextDirection(text)}>
      {splitDescriptionLinks(text).map((part, index) =>
        part.kind === "link" ? (
          <a
            // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and static
            key={index}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            {part.text}
          </a>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and static
          <span key={index}>{part.text}</span>
        ),
      )}
    </p>
  );
}
