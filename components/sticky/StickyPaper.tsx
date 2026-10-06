"use client";

import { Users } from "lucide-react";
import { splitLinks, type StickyNoteDTO } from "@/lib/sticky-shared";

/**
 * One sticky: pastel paper, adhesive strip, curled corner (all CSS, see
 * app/ds.css "Sticky notes"). The body is the one handwriting face in the
 * app. Team notes carry the author's monogram in the foot. Size comes from
 * the note (custom sizing); `handle` is the desktop resize grip.
 */
export default function StickyPaper({
  note,
  small = false,
  className = "",
  style,
  onOpen,
  handle,
  ...rest
}: {
  note: StickyNoteDTO;
  /** Phone row: capped size */
  small?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onOpen?: () => void;
  handle?: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className" | "onClick">) {
  const colorClass = `ds-sticky-${note.color.toLowerCase()}`;
  const w = small ? Math.min(note.width, 200) : note.width;
  const h = small ? Math.min(note.height, 200) : note.height;
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
      className={`ds-sticky ${colorClass} ${small ? "ds-sticky-sm" : ""} ${className}`}
      style={{ "--tilt": `${note.rotation}deg`, "--w": `${w}px`, "--h": `${h}px`, ...style } as React.CSSProperties}
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
      {(note.shared || note.expiryLabel) && (
        <span className="ds-sticky-foot">
          <span className="inline-flex min-w-0 items-center gap-1 truncate">
            {note.shared && (
              <>
                <Users size={11} aria-hidden /> Team
              </>
            )}
            {note.shared && note.expiryLabel && <span aria-hidden> · </span>}
            {note.expiryLabel}
          </span>
          {note.shared && (
            <span className="ds-sticky-mono" title={note.authorName} aria-label={`By ${note.authorName}`}>
              {note.authorMonogram}
            </span>
          )}
        </span>
      )}
      {handle}
    </div>
  );
}
