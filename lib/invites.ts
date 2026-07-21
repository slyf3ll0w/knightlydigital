import crypto from "crypto";
import { prisma } from "@/lib/db";

/**
 * Invite-gated onboarding. Registration requires a live InviteCode, minted
 * by a superadmin (directly or by approving an /apply application). Codes
 * are single-use and claimed atomically inside the register transaction.
 */

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

export type InviteCheck = { ok: true; id: string } | { ok: false; reason: string };

export async function checkInviteCode(raw: unknown): Promise<InviteCheck> {
  const code = typeof raw === "string" ? normalizeInviteCode(raw) : "";
  if (!code) return { ok: false, reason: "An invite code is required." };
  const invite = await prisma.inviteCode.findUnique({ where: { code } });
  if (!invite) return { ok: false, reason: "That invite code isn't valid." };
  if (invite.revokedAt) return { ok: false, reason: "That invite code is no longer active." };
  if (invite.usedAt) return { ok: false, reason: "That invite code has already been used." };
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return { ok: false, reason: "That invite code has expired." };
  }
  return { ok: true, id: invite.id };
}
