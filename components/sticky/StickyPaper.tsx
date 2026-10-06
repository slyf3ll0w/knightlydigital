"use client";

import { Users } from "lucide-react";
import { splitLinks, type StickyNoteDTO } from "@/lib/sticky-shared";

/**
 * One sticky: pastel paper, adhesive strip, curled corner (all CSS, see
 * app/ds.css "Sticky notes"). The body is the one handwriting face in the
 * app. Team notes carry the author's monogram in the foot.
 */
export default function StickyPaper({
  note,
  small = false,
  pinned = false,
  className = "",
  style,
  onOpen,
  ...rest
}: {
  note: StickyNoteDTO;
  small?: boolean;
  /** On the corkboard: a push-pin instead of the adhesive strip */
  pinned?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onOpen?: () => void;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className" | "onClick">) {
  const colorClass = `ds-sticky-${note.color.toLowerCase()}`;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Note: ${note.body.slice(0, 60)}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen?.();
        }
      }}
      className={`ds-sticky ${colorClass} ${small ? "ds-sticky-sm" : ""} ${pinned ? "ds-sticky-pinned" : ""} ${className}`}
      style={{ "--tilt": `${note.rotation}deg`, ...style } as React.CSSProperties}
      {...rest}
    >
      <p className="ds-sticky-body">
        {splitLinks(note.body).map((part, i) =>
          part.href ? (
            <a key={i} href={part.href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
              {part.text}
            </a>
          ) : (
            <span key={i}>{part.text}</span>
          )
        )}
      </p>
      {note.shared && (
        <span className="ds-sticky-foot">
          <span className="inline-flex items-center gap-1">
            <Users size={11} aria-hidden /> Team
          </span>
          <span className="ds-sticky-mono" title={note.authorName} aria-label={`By ${note.authorName}`}>
            {note.authorMonogram}
          </span>
        </span>
      )}
    </div>
  );
}
