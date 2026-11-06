import { NextResponse } from "next/server";
import { recordSentView, reportSentDocument, senderFromCookie } from "@/lib/tool-send";

/**
 * POST /api/public/tools/email/view — the hosted page's view beacon
 * ({ token }), fired by components/wb/tools/SentViewBeacon.tsx once the tab
 * has been visible for a moment (email link scanners don't get that far).
 * { token, report: true } is the recipient's "I didn't ask for this":
 * the send is flagged and the sender is blocked (lib/tool-send.ts). Always
 * 200 — this endpoint must never say which tokens exist.
 */
export async function POST(req: Request) {
  let body: { token?: unknown; report?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* bland OK below */
  }
  const token = typeof body.token === "string" ? body.token : "";
  if (body.report === true) {
    await reportSentDocument(token).catch(() => false);
    return NextResponse.json({ ok: true });
  }
  const viewer = await senderFromCookie(req.headers.get("cookie")).catch(() => null);
  await recordSentView(token, viewer?.id ?? null).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
