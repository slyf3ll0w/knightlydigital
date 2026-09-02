import type { ScheduleAppearance } from "@/app/book/[slug]/schedule/shell";

/** Ground + font for embedded scheduling pages (no logo/header — the host page has its own). */
export default function EmbedScheduleShell({ appearance, children }: { appearance: ScheduleAppearance; children: React.ReactNode }) {
  const { dark, transparent, fontName, fontHref, zoom } = appearance;
  const pageBg = transparent ? "transparent" : dark ? "#0C0F0C" : "#ffffff";
  return (
    <div className="app-ui p-4" style={{ backgroundColor: pageBg, zoom, ...(fontName ? { fontFamily: `"${fontName}", sans-serif` } : {}) }}>
      <style>{`html,body{background:${pageBg} !important}`}</style>
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
