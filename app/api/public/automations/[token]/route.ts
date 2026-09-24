import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { limit } from "@/lib/rate-limit";
import { AUTOMATION_LIMITS } from "@/lib/automations";
import { fireWebhook } from "@/lib/automations-server";

export const dynamic = "force-dynamic";

/**
 * POST /api/public/automations/<token> — the inbound side of "a webhook is
 * received". The token IS the credential (32 random bytes, per automation,
 * minted on save); anything else is a bare 404 so the URL space can't be
 * probed. The body is a JSON object (or a form post) whose top-level scalar
 * keys become data_<key> fields for the rule. Accepted posts answer 202 at
 * once; the rule runs behind the response.
 *
 * Dedupe: a hash of token + minute + body, so a connector that retries the
 * same post inside a minute doesn't run the rule twice, while a genuinely
 * new payload always does.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return new NextResponse(null, { status: 404 });

  const rl = await limit(`automation-webhook:${token}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } });

  const automation = await prisma.automation.findUnique({
    where: { webhookToken: token },
    select: { id: true, companyId: true, name: true, createdById: true, spec: true, isActive: true, company: { select: { suspendedAt: true } } },
  });
  if (!automation || !automation.isActive || automation.company.suspendedAt) return new NextResponse(null, { status: 404 });

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > AUTOMATION_LIMITS.webhookBodyBytes) return NextResponse.json({ error: "Body too large." }, { status: 413 });
  const raw = await req.text().catch(() => "");
  if (Buffer.byteLength(raw) > AUTOMATION_LIMITS.webhookBodyBytes) return NextResponse.json({ error: "Body too large." }, { status: 413 });

  let payload: Record<string, unknown> = {};
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/x-www-form-urlencoded")) {
    payload = Object.fromEntries(new URLSearchParams(raw).entries());
  } else if (raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) payload = parsed as Record<string, unknown>;
      else if (Array.isArray(parsed)) payload = { items: parsed.length, first: typeof parsed[0] === "object" ? undefined : parsed[0] };
    } catch {
      return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
    }
  }
  // Nested objects are flattened one level (Zapier/Make wrap fields in "data")
  for (const [k, v] of Object.entries(payload)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) if (!(k2 in payload)) payload[k2] = v2;
      delete payload[k];
    }
  }

  const minute = Math.floor(Date.now() / 60_000);
  const entityId = createHash("sha256").update(`${token}:${minute}:${raw}`).digest("hex").slice(0, 32);
  // Runs behind the response — the caller (Zapier, a form) shouldn't wait on
  // our emails. The engine never throws.
  void fireWebhook(automation, entityId, payload).catch((err) => console.error("[automations] webhook run failed", err));
  return NextResponse.json({ ok: true }, { status: 202 });
}
