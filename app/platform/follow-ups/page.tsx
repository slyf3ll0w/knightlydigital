import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageActor, canSeeMoney, canSell } from "@/lib/permissions";
import { loadFollowUps } from "@/lib/follow-ups-server";
import FollowUpsClient from "./FollowUpsClient";

export const metadata: Metadata = { title: "Follow-ups" };
export const dynamic = "force-dynamic";

/**
 * Follow-ups: the quotes and unpaid invoices worth a personal nudge today,
 * each with a message ready to read and send
 * (docs/plans/ai-workers-follow-ups-2026-11-17.md). The app writes; a person
 * sends. Sales roles see quotes, anyone who may see money sees invoices.
 */
export default async function FollowUpsPage() {
  const actor = await requirePageActor((a) => canSell(a.role) || canSeeMoney(a));
  const [list, company] = await Promise.all([
    loadFollowUps(actor),
    prisma.company.findUnique({ where: { id: actor.companyId }, select: { assistantName: true } }),
  ]);
  return <FollowUpsClient initial={list} atlasName={company?.assistantName || "Atlas"} />;
}
