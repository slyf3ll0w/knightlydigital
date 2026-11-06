import { NextResponse } from "next/server";
import { verifyCaptcha } from "@/lib/captcha";
import { clientIp, limit } from "@/lib/rate-limit";
import { recordSiteEvent } from "@/lib/site-events";
import { listSends, senderFromCookie, sendToolDocument, sendsLeftToday } from "@/lib/tool-send";

/**
 * POST /api/public/tools/email/send — a verified sender emails the document
 * on their page: { doc, logo?, to: string[], copyMe?, captchaToken, path? }.
 * The cookie names the sender (401 without one); lib/tool-send.ts holds the
 * caps. Answers the hosted link plus the refreshed sent list.
 */
export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  if (ip !== "unknown" && !(await limit(`tools-send-ip:${ip}`, 20, 60 * 60_000)).ok) {
    return NextResponse.json({ error: "Too many sends from this connection. Try again later." }, { status: 429 });
  }
  const sender = await senderFromCookie(req.headers.get("cookie"));
  if (!sender) return NextResponse.json({ error: "Verify your email address first.", code: "VERIFY" }, { status: 401 });
  let body: { doc?: unknown; logo?: unknown; to?: unknown; copyMe?: unknown; captchaToken?: unknown; path?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!(await verifyCaptcha(typeof body.captchaToken === "string" ? body.captchaToken : null, "tools"))) {
    return NextResponse.json({ error: "Captcha verification failed. Please try again." }, { status: 400 });
  }
  const result = await sendToolDocument({ sender, doc: body.doc, logo: body.logo, to: body.to, copyMe: body.copyMe === true, ip });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  void recordSiteEvent({ name: "tool_email", label: typeof body.doc === "object" && body.doc && (body.doc as { kind?: string }).kind === "estimate" ? "estimate" : "invoice", path: typeof body.path === "string" ? body.path : "/tools" });
  const [sends, left] = await Promise.all([listSends(sender.id), sendsLeftToday(sender.id)]);
  return NextResponse.json({ token: result.token, href: result.href, recipients: result.recipients, sends, left });
}
