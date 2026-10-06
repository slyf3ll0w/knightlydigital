"use client";

import { useRef, useState } from "react";

/**
 * Drag files from the desktop onto a conversation to send them. Spread
 * `handlers` on the drop zone and show <FileDropOverlay> while `over`.
 * Only drags that carry files react (dragging text or a link around the page
 * does nothing), and the enter/leave depth counter keeps the overlay steady
 * while the pointer crosses child elements.
 */
export function useFileDrop(onFiles: (files: File[]) => void, enabled = true) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

  const handlers = {
    onDragEnter(e: React.DragEvent) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current++;
      if (enabled) setOver(true);
    },
    onDragOver(e: React.DragEvent) {
      if (!hasFiles(e)) return;
      // Without preventDefault the browser opens the file instead of dropping it here
      e.preventDefault();
      e.dataTransfer.dropEffect = enabled ? "copy" : "none";
    },
    onDragLeave(e: React.DragEvent) {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    },
    onDrop(e: React.DragEvent) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      if (!enabled) return;
      const files = Array.from(e.dataTransfer.files);
      if (files.length) onFiles(files);
    },
  };
  return { over, handlers };
}
