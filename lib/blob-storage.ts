import { AwsClient } from "aws4fetch";

/**
 * Object storage for uploaded files (Cloudflare R2, S3-compatible).
 *
 * Why this exists: job photos were stored as Postgres `Bytes`, up to 4MB
 * each, with no cap outside preview mode. Every job page then pulled N
 * multi-megabyte BLOBs back out through the app, every database backup
 * carried the whole photo library, and nothing was ever served from a CDN.
 * That works for a demo and falls over for a real roofing company shooting
 * thirty photos a roof.
 *
 * Configuration is OPTIONAL and the integration is invisible until it's set.
 * With no R2 credentials, uploads keep going into Postgres exactly as before —
 * so this deploys safely before the bucket exists, and an outage in R2 can be
 * rolled back by unsetting the env vars.
 *
 * Env vars:
 *   R2_ACCOUNT_ID         — Cloudflare account id
 *   R2_ACCESS_KEY_ID      — R2 API token key
 *   R2_SECRET_ACCESS_KEY  — R2 API token secret
 *   R2_BUCKET             — bucket name
 *   R2_ENDPOINT           — optional override (defaults to the account's
 *                           <account>.r2.cloudflarestorage.com)
 *
 * Objects are PRIVATE. Reads go out as short-lived presigned URLs minted only
 * after the app has authorized the request, so a leaked link dies in minutes
 * and the bucket needs no public access.
 */

const REGION = "auto"; // R2 ignores region but SigV4 requires one

export interface StoredObject {
  key: string;
  size: number;
  contentType: string;
}

export function isBlobStorageConfigured(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET
  );
}

function endpoint(): string {
  const override = process.env.R2_ENDPOINT?.replace(/\/+$/, "");
  if (override) return override;
  return `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

function bucketUrl(key: string): string {
  // Keys are path segments we generate (ids + a known extension), never user
  // input, but encode each segment anyway so a stray character can't reshape
  // the URL.
  const safe = key.split("/").map(encodeURIComponent).join("/");
  return `${endpoint()}/${process.env.R2_BUCKET}/${safe}`;
}

function client(): AwsClient {
  return new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    service: "s3",
    region: REGION,
  });
}

/**
 * Store bytes under `key`. Throws on failure — callers decide whether to fall
 * back to the database or surface the error, and silently losing an upload is
 * worse than either.
 */
export async function putObject(
  key: string,
  body: Buffer,
  contentType: string
): Promise<StoredObject> {
  // Copy into a plainly-typed array first. A Node Buffer's backing store is
  // ArrayBufferLike (possibly shared), which BlobPart won't accept; this also
  // detaches the body from any pooled buffer Node handed us.
  const bytes = new Uint8Array(body.byteLength);
  bytes.set(body);

  // A Blob rather than the raw Buffer: it satisfies BodyInit and carries its
  // own length, so fetch sets Content-Length for us.
  const res = await client().fetch(bucketUrl(key), {
    method: "PUT",
    body: new Blob([bytes], { type: contentType }),
    headers: { "Content-Type": contentType },
  });
  if (!res.ok) {
    throw new Error(`R2 PUT ${key} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  return { key, size: body.byteLength, contentType };
}

/**
 * A time-limited URL the browser can fetch directly, so image bytes never
 * round-trip through the app server. Default 10 minutes: long enough for a
 * job page full of photos to load (and to be re-fetched on a flaky phone
 * connection), short enough that a copied link is useless by the time it
 * lands anywhere.
 */
export async function signedGetUrl(key: string, expiresInSeconds = 600): Promise<string> {
  const url = new URL(bucketUrl(key));
  url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
  const signed = await client().sign(url.toString(), {
    method: "GET",
    aws: { signQuery: true },
  });
  return signed.url;
}

/**
 * Best-effort delete. A missing object is success — the caller is removing
 * the row either way, and an orphaned object is a cleanup problem, not a
 * reason to fail the user's delete.
 */
export async function deleteObject(key: string): Promise<void> {
  const res = await client().fetch(bucketUrl(key), { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 DELETE ${key} failed: ${res.status}`);
  }
}

/** Storage key for a job photo. Extension keeps the object readable in the R2 UI. */
export function jobPhotoKey(companyId: string, jobId: string, photoId: string, mimeType: string): string {
  const ext =
    { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[
      mimeType
    ] ?? "bin";
  return `companies/${companyId}/jobs/${jobId}/${photoId}.${ext}`;
}
