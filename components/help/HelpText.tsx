import Link from "next/link";
import { Fragment } from "react";

/**
 * Renders the Help Center's inline markup: **bold**, `UI label` and
 * [link](/path). In the public Help Center, links into the app still point
 * at /app/… (they land on sign-in); links to other articles are rewritten
 * to the current Help Center base.
 */
export default function HelpText({ text, base }: { text: string; base: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold text-[color:var(--ds-ink)]">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <span key={i} className="help-ui">
              {part.slice(1, -1)}
            </span>
          );
        }
        const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (link) {
          let href = link[2];
          if (href.startsWith("/help/")) href = `${base}/${href.slice(6)}`;
          const external = /^https?:/.test(href);
          return external ? (
            <a key={i} href={href} target="_blank" rel="noreferrer" className="ds-link">
              {link[1]}
            </a>
          ) : (
            <Link key={i} prefetch={false} href={href} className="ds-link">
              {link[1]}
            </Link>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}
