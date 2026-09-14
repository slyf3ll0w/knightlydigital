import crypto from "crypto";
import { prisma } from "@/lib/db";

/**
 * Invite codes — the sanctioned way around underwriting. A code is minted by
 * a superadmin (directly, or by approving a legacy application) and handed to
 * a business we want on WorkBench without card processing: entering it on
 * the unlisted /invite page (or /app/register) opens the company with the
 * human review skipped AND Finix underwriting waived (Company.paymentsWaived),
 * so they land on the dashboard instead of the /app/activate KYC gate.
 * Codes are single-use and claimed atomically inside the signup transaction.
 *
 * The UNIVERSAL code is the exception: one shared, reusable code for getting
 * testers on without minting anything. It opens the company the same way,
 * and paymentsWaived then also means "online payments are coming soon" —
 * Settings shows a Coming-soon card instead of the Finix form, pay pages are
 * view-only and invoice emails say View rather than Pay (lib/payments-gate.ts
 * onlinePaymentsHeld). Rotate it by setting UNIVERSAL_INVITE_CODE in the
 * environment; set it to "off" to disable the shared code entirely.
 */

const DEFAULT_UNIVERSAL_CODE = "Workbench123";

/** The shared tester code, or null when it's switched off. */
export function universalInviteCode(): string | null {
  const raw = (process.env.UNIVERSAL_INVITE_CODE ?? DEFAULT_UNIVERSAL_CODE).trim();
  if (!raw || raw.toLowerCase() === "off") return null;
  return raw;
}

/** Case- and whitespace-insensitive — it's typed by hand from a text message. */
export function isUniversalInviteCode(raw: unknown): boolean {
  const code = universalInviteCode();
  if (!code || typeof raw !== "string") return false;
  return raw.replace(/\s+/g, "").toLowerCase() === code.replace(/\s+/g, "").toLowerCase();
}

// No 0/O/1/I/L — codes get read over the phone and typed on job sites.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateInviteCode(): string {
  const pick = () => ALPHABET[crypto.randomInt(ALPHABET.length)];
  const group = () => Array.from({ length: 4 }, pick).join("");
  return `WB-${group()}-${group()}`;
}

/** Tolerate lowercase, stray spaces, and missing dashes from hand-typing. */
export function normalizeInviteCode(raw: string): string {
  const bare = (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/^WB[A-Z0-9]{8}$/.test(bare)) {
    return `WB-${bare.slice(2, 6)}-${bare.slice(6)}`;
  }
  return raw.trim().toUpperCase();
}

/** `id` is null for the universal code — there's no row to claim. */
export type InviteCheck =
  | { ok: true; id: string | null; universal: boolean }
  | { ok: false; reason: string };

export async function checkInviteCode(raw: unknown): Promise<InviteCheck> {
  if (isUniversalInviteCode(raw)) return { ok: true, id: null, universal: true };
  const code = typeof raw === "string" ? normalizeInviteCode(raw) : "";
  if (!code) return { ok: false, reason: "An invite code is required." };
  const invite = await prisma.inviteCode.findUnique({ where: { code } });
  if (!invite) return { ok: false, reason: "That invite code isn't valid." };
  if (invite.revokedAt) return { ok: false, reason: "That invite code is no longer active." };
  if (invite.usedAt) return { ok: false, reason: "That invite code has already been used." };
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return { ok: false, reason: "That invite code has expired." };
  }
  return { ok: true, id: invite.id, universal: false };
}
