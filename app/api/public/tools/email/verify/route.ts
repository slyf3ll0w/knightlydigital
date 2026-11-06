import { NextResponse } from "next/server";
import { clientIp, limit } from "@/lib/rate-limit";
import { checkVerification, listSends, senderCookieHeader, sendsLeftToday } from "@/lib/tool-send";

/**
 * POST /api/public/tools/email/verify — { email, code } → the sender is
 * verified and the signed 30-day session cookie is set. Answers the same
 * shape as GET …/session so the page can switch straight to composing.
 */
export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  if (ip !== "unknown" && !(await limit(`tools-verify-ip:${ip}`, 30, 60 * 60_000)).ok) {
    return NextResponse.json({ error: "Too many tries. Wait a bit and send a new code." }, { status: 429 });
  }
  let body: { email?: unknown; code?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const result = await checkVerification(body.email, body.code);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const [sends, left] = await Promise.all([listSends(result.senderId), sendsLeftToday(result.senderId)]);
  const res = NextResponse.json({ enabled: true, sender: { email: result.email }, sends, left });
  res.headers.append("Set-Cookie", senderCookieHeader(result.cookie));
  return res;
}
