import { NextRequest, NextResponse } from "next/server";
import { markTyping } from "@/lib/chat";
import { clientIp, limit } from "@/lib/rate-limit";
import { siteChatSecret, verifySiteChatToken } from "@/lib/site-chat";

/**
 * Visitor typing heartbeat for the website chat. In-memory only (same map
 * as team chat), keyed on the contact's thread; the team thread's poll
 * reads it back as "… is typing".
 */
export async function POST(req: NextRequest) {
  const rl = await limit(`site-chat:typing:${clientIp(req.headers)}`, 90, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  if (!siteChatSecret()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json().catch(() => null);
  const contactId = verifySiteChatToken(typeof data?.token === "string" ? data.token : null);
  if (!contactId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  markTyping(`portal:${contactId}`, "visitor");
  return NextResponse.json({ ok: true });
}
