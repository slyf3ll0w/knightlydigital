"use client";

import { useEffect, useRef } from "react";

/**
 * Paste a picture from the clipboard (a screenshot, a copied image) into a
 * conversation to send it. The listener sits on the document so ⌘V / Ctrl+V
 * works whether or not the composer has focus. Only clipboard items that are
 * files react — pasting words into the composer is untouched — and a paste
 * into a text field outside `within` (a selector for the conversation pane:
 * the search box) is left to that field. While a dialog or sheet is up
 * (aria-modal) that doesn't hold the pane, the paste is its business, not
 * the composer's underneath.
 */
export function usePasteFiles(onFiles: (files: File[]) => void, enabled = true, within?: string) {
  const latest = useRef(onFiles);
  latest.current = onFiles;

  useEffect(() => {
    if (!enabled) return;
    function onPaste(e: ClipboardEvent) {
      const files = clipboardFiles(e.clipboardData);
      if (files.length === 0) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (within && target && isEditable(target) && !target.closest(within)) return;
      const modal = document.querySelector('[aria-modal="true"]');
      if (modal && !(within && (modal.closest(within) || modal.querySelector(within)))) return;
      // Without preventDefault the browser also drops the picture's text or
      // html fallback into the composer
      e.preventDefault();
      latest.current(files);
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [enabled, within]);
}

function isEditable(el: HTMLElement) {
  return el.isContentEditable || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

/** Files on the clipboard, with a pasted screenshot's generic "image.png" given a readable name. */
export function clipboardFiles(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files = Array.from(data.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((f): f is File => !!f);
  return files.map((f) => {
    // Chrome and Safari hand a pasted screenshot over as "image.png"
    if (!/^image\.[a-z0-9]+$/i.test(f.name)) return f;
    const ext = f.name.slice(f.name.lastIndexOf("."));
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}`;
    return new File([f], `Pasted ${stamp}${ext}`, { type: f.type, lastModified: f.lastModified });
  });
}
