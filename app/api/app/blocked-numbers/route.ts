import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell } from "@/lib/permissions";
import { phoneDigits } from "@/lib/phone";
import { blockDigits, blockNumber, listBlockedNumbers, unblockNumber, prettyBlocked } from "@/lib/blocked-numbers";

/**
 * Blocked numbers (lib/blocked-numbers.ts). Anyone who works the phones
 * (the roles that can open Calls and Messages) can block and unblock.
 *
 *   GET            → { blocked: [...] }; with ?phone= also { isBlocked }
 *   POST   { phone, label? } → block it
 *   DELETE ?phone=           → unblock it
 */
const headers = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const blocked = await listBlockedNumbers(actor.companyId);
  const asked = blockDigits(req.nextUrl.searchParams.get("phone"));
  return NextResponse.json({ blocked, ...(asked ? { isBlocked: blocked.some((b) => b.digits === asked) } : {}) }, { headers });
}

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { phone?: unknown; label?: unknown } | null;
  const digits = blockDigits(typeof body?.phone === "string" ? body.phone : "");
  if (!digits) return NextResponse.json({ error: "Enter a 10-digit US phone number." }, { status: 400 });
  const company = await prisma.company.findUnique({ where: { id: actor.companyId }, select: { lineNumber: true, lineForwardTo: true } });
  if (company && [company.lineNumber, company.lineForwardTo].some((n) => n && phoneDigits(n) === digits)) {
    return NextResponse.json({ error: "That's one of your own numbers." }, { status: 400 });
  }
  const row = await blockNumber(actor.companyId, digits, { label: typeof body?.label === "string" ? body.label : null, userId: actor.id });
  return NextResponse.json({ blocked: row }, { status: 201, headers });
}

export async function DELETE(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const digits = blockDigits(req.nextUrl.searchParams.get("phone"));
  if (!digits) return NextResponse.json({ error: "Enter a 10-digit US phone number." }, { status: 400 });
  const was = await unblockNumber(actor.companyId, digits);
  return NextResponse.json({ ok: true, wasBlocked: was, number: prettyBlocked(digits) }, { headers });
}
