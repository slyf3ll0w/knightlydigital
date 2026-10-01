/**
 * Pictures and clips on thread messages (PortalMessageMedia): MMS in both
 * directions on the business line, and photos the team attaches on a
 * portal-only thread. Bytes follow the JobPhoto pattern — R2 when object
 * storage is configured, else the `data` column — and every reader goes
 * through mediaResponse(), which redirects to a short-lived signed R2 URL or
 * streams the bytes.
 *
 * Three doors, one row:
 *   /api/message-media/[id]        team, signed in, company-scoped
 *   /api/hub/message-media/[id]    the client, by hub token
 *   /api/public/mms/[id]           Telnyx, while it fetches an outbound MMS
 *                                  body (the cuid is the only key — the
 *                                  same trust Telnyx's own media links carry)
 *
 * Carriers cap an MMS body at roughly a megabyte, so the composer downsizes
 * pictures on the device before upload (lib/resize-image.ts) and the server
 * refuses anything over MMS_MAX_BYTES outright; inbound media is taken as
 * Telnyx delivers it, up to INBOUND_MAX_BYTES.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isBlobStorageConfigured, putObject, signedGetUrl, deleteObject } from "@/lib/blob-storage";
import { reportError } from "@/lib/report-error";

/** What a text message can carry (Telnyx: image/jpeg, image/png, image/gif, video/mp4, video/3gpp, audio, vCard). */
export const MMS_TYPES = new Set([
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
]);
/** Outbound: what we hand Telnyx (carriers reject bigger bodies; pictures are downsized client-side first). */
export const MMS_MAX_BYTES = 1_000_000;
/** Inbound: what we keep of what Telnyx fetched for us. */
export const INBOUND_MAX_BYTES = 5_000_000;

export type MediaRow = { id: string; contentType: string; sizeBytes: number };

/** Shape the thread JSON carries per attachment; `url` is the door for whoever is reading. */
export type ThreadMedia = { id: string; type: string; url: string };

export function threadMedia(rows: MediaRow[], door: "team" | "hub", hubToken?: string): ThreadMedia[] {
  return rows.map((m) => ({
    id: m.id,
    type: m.contentType,
    url:
      door === "team"
        ? `/api/message-media/${m.id}`
        : `/api/hub/message-media/${m.id}?token=${encodeURIComponent(hubToken ?? "")}`,
  }));
}

export const messageMediaKey = (companyId: string, messageId: string, mediaId: string, contentType: string): string =>
  `message-media/${companyId}/${messageId}/${mediaId}.${extensionFor(contentType)}`;

export function extensionFor(contentType: string): string {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "video/mp4":
      return "mp4";
    case "video/3gpp":
      return "3gp";
    case "video/quicktime":
      return "mov";
    case "audio/mpeg":
      return "mp3";
    case "audio/mp4":
      return "m4a";
    case "audio/amr":
      return "amr";
    case "text/vcard":
    case "text/x-vcard":
      return "vcf";
    default:
      return "bin";
  }
}

/** "Photo" / "Video" / "Audio" / "Contact card" / "Attachment" — for previews, pushes and the inbox row. */
export function mediaNoun(contentType: string): string {
  if (contentType.startsWith("image/")) return "Photo";
  if (contentType.startsWith("video/")) return "Video";
  if (contentType.startsWith("audio/")) return "Audio clip";
  if (contentType.endsWith("vcard")) return "Contact card";
  return "Attachment";
}

/** The line a message shows where its text would go when it has none: "📷 Photo", "📷 2 photos", "🎬 Video". */
export function mediaPreview(body: string, media: Array<{ contentType: string }>): string {
  if (body.trim() || media.length === 0) return body;
  const first = media[0].contentType;
  const icon = first.startsWith("video/") ? "🎬" : first.startsWith("audio/") ? "🎤" : first.startsWith("image/") ? "📷" : "📎";
  if (media.length === 1) return `${icon} ${mediaNoun(first)}`;
  const noun = mediaNoun(first).toLowerCase();
  return `${icon} ${media.length} ${noun === "photo" ? "photos" : noun === "video" ? "videos" : "attachments"}`;
}

/** Store one attachment under a message; returns the row. R2 when configured, else Postgres bytes. */
export async function storeMessageMedia(args: {
  companyId: string;
  messageId: string;
  bytes: Buffer;
  contentType: string;
}): Promise<MediaRow> {
  const row = await prisma.portalMessageMedia.create({
    data: {
      messageId: args.messageId,
      companyId: args.companyId,
      contentType: args.contentType,
      sizeBytes: args.bytes.byteLength,
      data: isBlobStorageConfigured() ? null : args.bytes,
    },
    select: { id: true, contentType: true, sizeBytes: true },
  });
  if (isBlobStorageConfigured()) {
    const key = messageMediaKey(args.companyId, args.messageId, row.id, args.contentType);
    try {
      await putObject(key, args.bytes, args.contentType);
      await prisma.portalMessageMedia.update({ where: { id: row.id }, data: { storageKey: key } });
    } catch (err) {
      // R2 down: keep the bytes in the row rather than lose the picture.
      reportError("[message-media] R2 put failed, keeping bytes in Postgres:", err);
      await prisma.portalMessageMedia.update({ where: { id: row.id }, data: { data: args.bytes } });
    }
  }
  return row;
}

/** Pull Telnyx's copy of an inbound MMS attachment; null when it's too big, the wrong kind, or gone. */
export async function fetchInboundMedia(url: string, contentTypeHint?: string | null): Promise<{ bytes: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") ?? contentTypeHint ?? "").split(";")[0].trim().toLowerCase();
    if (!MMS_TYPES.has(contentType)) return null;
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > INBOUND_MAX_BYTES) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > INBOUND_MAX_BYTES) return null;
    return { bytes, contentType };
  } catch (err) {
    reportError("[message-media] inbound fetch failed:", err);
    return null;
  }
}

/** The HTTP answer for one attachment: a redirect to a signed R2 URL, or the bytes. The caller has already authorised. */
export async function mediaResponse(id: string, cache: "private" | "public" = "private"): Promise<NextResponse> {
  const row = await prisma.portalMessageMedia.findUnique({
    where: { id },
    select: { data: true, contentType: true, storageKey: true },
  });
  if (!row) return new NextResponse(null, { status: 404 });
  if (row.storageKey && isBlobStorageConfigured()) {
    try {
      const url = await signedGetUrl(row.storageKey, 600);
      // Never let a cache hand out an expired signed URL.
      return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      reportError("[message-media] signed URL failed:", err);
      if (!row.data) return new NextResponse(null, { status: 502 });
    }
  }
  if (!row.data) return new NextResponse(null, { status: 404 });
  const bytes = new Uint8Array(row.data.byteLength);
  bytes.set(row.data);
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": row.contentType,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": cache === "public" ? "public, max-age=3600" : "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Best-effort cleanup when a message is deleted outside the cascade. */
export async function deleteMessageMedia(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const rows = await prisma.portalMessageMedia.findMany({ where: { id: { in: ids } }, select: { id: true, storageKey: true } });
  await Promise.all(rows.map((r) => (r.storageKey ? deleteObject(r.storageKey).catch(() => {}) : Promise.resolve())));
  await prisma.portalMessageMedia.deleteMany({ where: { id: { in: ids } } });
}

/** The public URLs Telnyx fetches an outbound MMS body from. */
export function publicMmsUrls(baseUrl: string, media: Array<{ id: string }>): string[] {
  return media.map((m) => `${baseUrl.replace(/\/+$/, "")}/api/public/mms/${m.id}`);
}
