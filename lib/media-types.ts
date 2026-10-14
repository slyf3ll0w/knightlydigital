/**
 * What a message attachment may be — one list for the server's refusal
 * (lib/message-media.ts) and the composer's accept (components/
 * PendingAttachments.tsx), so a file that stages with a thumbnail is a file
 * the server will take. Client-safe: no Prisma here.
 */

/** What a text message can carry (Telnyx: image/jpeg, image/png, image/gif, video/mp4, video/3gpp, audio, vCard). */
export const MMS_TYPE_LIST = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/3gpp",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp4",
  "audio/amr",
  "text/vcard",
  "text/x-vcard",
] as const;

/** What the composer takes: pictures and clips (no audio or contact cards from the box). */
export const COMPOSER_TYPE_LIST = MMS_TYPE_LIST.filter((t) => t.startsWith("image/") || t.startsWith("video/"));

/**
 * Still pictures the composer re-encodes to JPEG on the device before
 * sending (lib/resize-image.ts), so the server never sees the original type.
 * HEIC/HEIF from an iPhone is the one that matters — the browser decodes it
 * where it can; where it can't, the file is refused here rather than at Send.
 */
export const COMPOSER_RESIZED_TYPES = ["image/heic", "image/heif"] as const;

/** The `accept` attribute for the composer's file picker. */
export const COMPOSER_ACCEPT = [...COMPOSER_TYPE_LIST, ...COMPOSER_RESIZED_TYPES].join(",");

export function isComposerFile(type: string): boolean {
  const t = type.toLowerCase();
  return (COMPOSER_TYPE_LIST as readonly string[]).includes(t) || (COMPOSER_RESIZED_TYPES as readonly string[]).includes(t);
}
