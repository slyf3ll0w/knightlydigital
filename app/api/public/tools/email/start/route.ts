import { NextResponse } from "next/server";
import { verifyCaptcha } from "@/lib/captcha";
import { clientIp, limit } from "@/lib/rate-limit";
import { startVerification } from "@/lib/tool-send";

/**
 * POST /api/public/tools/email/start — step one of emailing a document from
 * the free generator: { email, captchaToken } → a 6-digit code to that
 * inbox (lib/tool-send.ts). Per-address and per-IP limits on top of the
 * middleware's "tools" bucket; the captcha keeps a script from spraying
 * codes at strangers.
 */
export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  if (ip !== "unknown" && !(await limit(`tools-code-ip:${ip}`, 10, 60 * 60_000)).ok) {
    return NextResponse.json({ error: "Too many codes from this connection. Try again later." }, { status: 429 });
  }
  let body: { email?: unknown; captchaToken?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!(await verifyCaptcha(typeof body.captchaToken === "string" ? body.captchaToken : null, "tools"))) {
    return NextResponse.json({ error: "Captcha verification failed. Please try again." }, { status: 400 });
  }
  const result = await startVerification(body.email, ip);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
