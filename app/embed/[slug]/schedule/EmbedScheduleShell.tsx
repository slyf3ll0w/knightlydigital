import type { ScheduleAppearance } from "@/app/book/[slug]/schedule/shell";
import EmbedStyleMatch from "../EmbedStyleMatch";

/**
 * Website match (public/embed.js → EmbedStyleMatch): every rule is gated on
 * an attribute EmbedStyleMatch stamps on <html> once the host page's look
 * has arrived and checked out, so an old iframe snippet (no messages) and
 * ?match=0 render exactly the saved look.
 */
const MATCH_CSS = `
html[data-embed-match],html[data-embed-match] body,html[data-embed-match] .embed-shell{background:transparent !important}
html[data-embed-accent] .embed-shell{--wb-accent-bright:var(--embed-accent);--wb-accent:var(--embed-accent);--wb-accent-strong:var(--embed-accent);--wb-on-accent:var(--embed-on-accent)}
html[data-embed-font] .embed-shell{font-family:var(--embed-font) !important;font-feature-settings:normal}
html[data-embed-font] .embed-shell *{font-variant-numeric:normal}
html[data-embed-heading-font] .embed-shell :is(h1,h2,h3){font-family:var(--embed-heading-font)}
html[data-embed-heading-weight] .embed-shell :is(h1,h2,h3){font-weight:var(--embed-heading-weight)}
html[data-embed-size]{font-size:var(--embed-size)}
html[data-embed-radius] .embed-shell :is(button:not(.rounded-full),a.rounded,a.rounded-lg){border-radius:var(--embed-radius) !important}
html[data-embed-radius] .embed-shell :is(.card-ledger,.card-tool,.rounded-xl,.rounded-2xl){border-radius:min(calc(var(--embed-radius) * 1.5),16px) !important}
html[data-embed-radius] .embed-shell :is(input:not([type=radio]):not([type=checkbox]):not([type=range]),select,textarea){border-radius:min(var(--embed-radius),12px) !important}
html[data-embed-ink="light"] .embed-shell :is(.text-gray-900,.text-gray-800){color:var(--embed-ink)}
html[data-embed-ink="dark"] .embed-shell :is(h1,h2,h3,.text-white:not(button)){color:var(--embed-ink)}
`;

/** Ground + font for embedded scheduling pages (no logo/header — the host page has its own). */
export default function EmbedScheduleShell({ appearance, children }: { appearance: ScheduleAppearance; children: React.ReactNode }) {
  const { dark, transparent, fontName, fontHref, zoom } = appearance;
  const pageBg = transparent ? "transparent" : dark ? "#0C0F0C" : "#ffffff";
  return (
    <div className="embed-shell app-ui p-4" style={{ backgroundColor: pageBg, zoom, ...(fontName ? { fontFamily: `"${fontName}", sans-serif` } : {}) }}>
      <style>{`html,body{background:${pageBg} !important}${MATCH_CSS}`}</style>
      <EmbedStyleMatch dark={dark} />
      {fontHref && (
        <>
          {/* eslint-disable-next-line @next/next/no-page-custom-font */}
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          {/* eslint-disable-next-line @next/next/no-page-custom-font */}
          <link rel="stylesheet" href={fontHref} />
        </>
      )}
      {children}
    </div>
  );
}
