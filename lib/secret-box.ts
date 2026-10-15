import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "crypto";

/**
 * Secrets at rest (OAuth tokens and the like): AES-256-GCM with a key derived
 * from AUTH_SECRET and a per-use scope label, so a Square token and a
 * QuickBooks token never share a key even though they share the secret.
 * Format: `v1:<iv b64>:<tag b64>:<ciphertext b64>` — the same shape
 * lib/quickbooks.ts has used since 2026-08, kept so a future consolidation
 * is a key-label change, not a migration.
 */
function keyFor(scope: string): Buffer {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required to store secrets");
  return createHash("sha256").update(`${scope}:${secret}`).digest();
}

export function sealSecret(plain: string, scope: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(scope), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${ct.toString("base64")}`;
}

export function openSecret(stored: string, scope: string): string {
  const [version, iv, tag, ct] = stored.split(":");
  if (version !== "v1" || !iv || !tag || !ct) throw new Error("Unrecognized secret format");
  const decipher = createDecipheriv("aes-256-gcm", keyFor(scope), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
}

/** HMAC-SHA256 hex over `message`, keyed like the secrets of `scope`. */
export function signMessage(message: string, scope: string): string {
  return createHmac("sha256", keyFor(scope)).update(message).digest("hex");
}
