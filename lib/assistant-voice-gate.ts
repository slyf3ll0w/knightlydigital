import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { limit } from "@/lib/rate-limit";
import { ATLAS_ACCESS_SELECT, atlasAccess } from "@/lib/assistant-access";
import { centsToAtlasTokens, debitAtlasTokens } from "@/lib/assistant-billing";
import type { Actor } from "@/lib/permissions";

/**
 * The speech endpoints (speak / transcribe) sit behind the same door as the
 * chat itself: a signed-in user, an account where Atlas is on and not out
 * of tokens, and a per-user burst cap. They spend real money, so metered
 * accounts are debited like a chat turn (`charge`).
 */
export type VoiceGate =
  | { ok: true; actor: Actor; metered: boolean; charge: (cents: number) => Promise<void> }
  | { ok: false; status: number; error: string };

export async function voiceGate(kind: "speak" | "transcribe"): Promise<VoiceGate> {
  const actor = await getActor();
  if (!actor) return { ok: false, status: 401, error: "Unauthorized" };
  const [company, burst] = await Promise.all([
    prisma.company.findUnique({ where: { id: actor.companyId }, select: ATLAS_ACCESS_SELECT }),
    limit(`assistant-${kind}:${actor.id}`, kind === "speak" ? 60 : 40, 10 * 60 * 1000),
  ]);
  const access = company ? atlasAccess(company) : null;
  if (!access || access.level === "off") return { ok: false, status: 403, error: "The AI assistant isn't included on this account." };
  if (access.level === "locked") return { ok: false, status: 403, error: "Atlas is out of tokens for now." };
  if (!burst.ok) return { ok: false, status: 429, error: "Give it a moment." };
  const metered = access.level === "free" || access.level === "plan";
  return {
    ok: true,
    actor,
    metered,
    charge: async (cents) => {
      if (!metered) return;
      const tokens = centsToAtlasTokens(cents);
      if (tokens > 0) await debitAtlasTokens(actor.companyId, tokens);
    },
  };
}
