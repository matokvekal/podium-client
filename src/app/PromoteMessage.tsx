// The "Registration Information" a PROMOTE event shows in place of Join. Plain text only: http(s)
// URLs become links (React nodes, never raw HTML), everything else stays text.

import { promoteMessageOf, splitDescriptionLinks } from "../lib/promote";
import { detectTextDirection } from "../lib/text-direction";

export function PromoteMessage({
  message,
  className,
  linkClassName,
}: {
  message: string | null | undefined;
  className?: string;
  linkClassName?: string;
}) {
  const text = promoteMessageOf(message);
  return (
    <span
      className={className}
      dir={detectTextDirection(text)}
      style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
      data-testid="promote-message"
    >
      {splitDescriptionLinks(text).map((part, index) =>
        part.kind === "link" ? (
          <a
            // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and static
            key={index}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClassName}
          >
            {part.text}
          </a>
        ) : (
          part.text
        ),
      )}
    </span>
  );
}
