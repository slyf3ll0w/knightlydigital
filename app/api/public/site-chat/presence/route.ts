import { NextRequest, NextResponse } from "next/server";
import { clientIp, limit } from "@/lib/rate-limit";
import { markVisitorLeft, siteChatCompanyId, verifySiteChatToken } from "@/lib/site-chat";

/**
 * The visitor is leaving the site. Sent with navigator.sendBeacon on
 * pagehide, so the body arrives as text and the response is ignored. Marks
 * the thread offline and, when the visitor left no way to reach them,
 * pushes the team a heads-up (lib/site-chat.ts).
 */
export async function POST(req: NextRequest) {
  const rl = await limit(`site-chat:presence:${clientIp(req.headers)}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const raw = await req.text().catch(() => "");
  let token: string | null = null;
  try {
    const parsed = JSON.parse(raw) as { token?: unknown };
    token = typeof parsed.token === "string" ? parsed.token : null;
  } catch {
    token = null;
  }
  const contactId = verifySiteChatToken(token);
  if (!contactId || !(await siteChatCompanyId())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await markVisitorLeft(contactId).catch((err) => console.error("[site-chat] leave failed:", err));
  return NextResponse.json({ ok: true });
}
