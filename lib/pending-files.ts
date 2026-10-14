import { isComposerFile } from "@/lib/media-types";

/**
 * The composer's attachment queue (components/PendingAttachments.tsx renders
 * it): what picked, dropped or pasted files get in, and how many. Pure, so
 * the rules have a unit test (scripts/test-pending-files.ts).
 */

/** How many photos or clips one send can carry (each goes out as its own message). */
export const MAX_PENDING_FILES = 10;

/**
 * The server's own list (lib/media-types.ts), not "anything image/* or
 * video/*": a .webm screen recording or a .bmp used to stage with a
 * thumbnail and then fail at Send with "Photos and videos can be sent".
 */
export function isSendableFile(f: File) {
  return isComposerFile(f.type);
}

/**
 * Add files to the queue: photos and videos only, up to the cap, and the
 * same file once (picked twice, or dropped then pasted). `skipped` =
 * something wasn't a photo or video, `full` = the cap cut the batch short.
 */
export function mergePendingFiles(current: File[], incoming: File[], max = MAX_PENDING_FILES) {
  const sendable = incoming.filter(isSendableFile);
  const seen = new Set(current.map(fileKey));
  const fresh = sendable.filter((f) => {
    const key = fileKey(f);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const room = Math.max(0, max - current.length);
  return {
    next: room > 0 && fresh.length > 0 ? [...current, ...fresh.slice(0, room)] : current,
    skipped: sendable.length < incoming.length,
    full: fresh.length > room,
  };
}

function fileKey(f: File) {
  return `${f.name}\u0000${f.size}\u0000${f.lastModified}`;
}
