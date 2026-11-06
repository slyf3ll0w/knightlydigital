import { NextResponse } from "next/server";
import { listSends, senderCookieHeader, senderFromCookie, sendsLeftToday, toolEmailEnabled } from "@/lib/tool-send";

/**
 * GET /api/public/tools/email/session — what the generator needs on mount:
 * whether emailing is switched on at all (TOOLS_EMAIL_FROM), who the cookie
 * says the sender is, their sent documents with Viewed stamps, and how
 * many sends they have left today. DELETE forgets the cookie ("not you?").
 * Never cached: the tool pages are static, this is the dynamic part.
 */
export async function GET(req: Request) {
  const enabled = toolEmailEnabled();
  if (!enabled) return NextResponse.json({ enabled: false, sender: null, sends: [], left: 0 }, { headers: { "Cache-Control": "no-store" } });
  const sender = await senderFromCookie(req.headers.get("cookie"));
  if (!sender) return NextResponse.json({ enabled: true, sender: null, sends: [], left: 0 }, { headers: { "Cache-Control": "no-store" } });
  const [sends, left] = await Promise.all([listSends(sender.id), sendsLeftToday(sender.id)]);
  return NextResponse.json(
    { enabled: true, sender: { email: sender.email, blocked: Boolean(sender.blockedAt) }, sends, left },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.headers.append("Set-Cookie", senderCookieHeader("", 0));
  return res;
}
