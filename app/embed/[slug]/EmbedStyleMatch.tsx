"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  clampFontSize,
  clampRadius,
  clampWeight,
  contrast,
  googleFontHrefs,
  isDarkGround,
  onAccentFor,
  parseCssColor,
  rgbToHex,
  sanitizeFontStack,
  type HostStyleMessage,
  type Rgb,
} from "@/lib/embed-style";

const WHITE: Rgb = [255, 255, 255];
const CARD_DARK: Rgb = [16, 20, 16]; // #101410, the dark card

/** Accent must stand off the card it's drawn on (and the host ground behind the frame). */
const MIN_ACCENT_CONTRAST = 2.4;
const MIN_INK_CONTRAST = 4.5;

function loadFont(href: string) {
  if (document.querySelector(`link[data-embed-font-href="${CSS.escape(href)}"]`)) return;
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = href;
  l.dataset.embedFontHref = href;
  document.head.appendChild(l);
}

/**
 * Takes the host website's look from public/embed.js (`workbench:style`) and
 * wears it: font, text color, ground (the frame goes transparent so the
 * site shows through; a dark site gets the dark form), accent with readable
 * on-color text, button/input corner radius. Every value is re-validated
 * here (any page can post into an iframe) and anything that fails — an
 * unreadable accent, an unparseable color — keeps the saved look.
 * `?match=0` on the frame URL turns it off for that placement. Old
 * iframe snippets never send the message, so they render as before.
 */
export default function EmbedStyleMatch({ dark }: { dark: boolean }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (window.parent === window) return;
    const qs = new URLSearchParams(window.location.search);
    if (qs.get("match") === "0") return;

    const onMsg = (e: MessageEvent) => {
      if (e.source !== window.parent) return;
      const d = e.data as HostStyleMessage | null;
      if (!d || typeof d !== "object" || d.type !== "workbench:style") return;
      const root = document.documentElement;
      const set = (attr: string, prop: string | null, value: string | null) => {
        if (value === null) {
          delete root.dataset[attr];
          if (prop) root.style.removeProperty(prop);
          return;
        }
        root.dataset[attr] = "";
        if (prop) root.style.setProperty(prop, value);
      };

      // Ground decides the form's theme. A mismatch re-renders server-side with ?theme=
      // (embed.js already asks for it up front; this covers in-frame navigation).
      const ground = parseCssColor(d.background) ?? WHITE;
      const hostDark = isDarkGround(ground);
      if (hostDark !== dark) {
        if (qs.get("theme") !== (hostDark ? "dark" : "light")) {
          qs.set("theme", hostDark ? "dark" : "light");
          router.replace(`${pathname}?${qs.toString()}`, { scroll: false });
        }
        return;
      }
      const card = dark ? CARD_DARK : WHITE;
      root.style.colorScheme = "light";
      set("embedMatch", null, "");

      // Accent: the host's button color when it reads on our card and the site, else the saved one
      const accent = parseCssColor(d.accent);
      if (accent && contrast(accent, card) >= MIN_ACCENT_CONTRAST && contrast(accent, ground) >= MIN_ACCENT_CONTRAST - 0.4) {
        set("embedAccent", "--embed-accent", rgbToHex(accent));
        root.style.setProperty("--embed-on-accent", onAccentFor(accent, parseCssColor(d.accentText)));
      } else {
        // components fall back to the saved accent through var(--embed-accent, saved)
        set("embedAccent", "--embed-accent", null);
        root.style.removeProperty("--embed-on-accent");
      }

      // Text color for headings/labels, only when it reads on our card
      const ink = parseCssColor(d.color);
      if (ink && contrast(ink, card) >= MIN_INK_CONTRAST) {
        root.style.setProperty("--embed-ink", rgbToHex(ink));
        root.dataset.embedInk = dark ? "dark" : "light";
      } else set("embedInk", "--embed-ink", null);

      const font = sanitizeFontStack(d.font);
      if (font) googleFontHrefs(font.first).forEach(loadFont);
      set("embedFont", "--embed-font", font ? font.stack : null);
      const heading = sanitizeFontStack(d.headingFont);
      if (heading && heading.stack !== font?.stack) {
        googleFontHrefs(heading.first).forEach(loadFont);
        set("embedHeadingFont", "--embed-heading-font", heading.stack);
        // Display faces are often one weight; bolding them fakes a bold
        const weight = clampWeight(d.headingWeight);
        set("embedHeadingWeight", "--embed-heading-weight", weight === null ? null : String(weight));
      } else {
        set("embedHeadingFont", "--embed-heading-font", null);
        set("embedHeadingWeight", "--embed-heading-weight", null);
      }

      const size = clampFontSize(d.fontSize);
      set("embedSize", "--embed-size", size && size !== 16 ? `${size}px` : null);
      const radius = clampRadius(d.radius);
      set("embedRadius", "--embed-radius", radius === null ? null : `${radius}px`);
    };

    window.addEventListener("message", onMsg);
    // The host script also posts on iframe load; asking covers hydration landing after it
    window.parent.postMessage({ type: "workbench:style-request" }, "*");
    return () => window.removeEventListener("message", onMsg);
  }, [dark, router, pathname]);

  return null;
}
