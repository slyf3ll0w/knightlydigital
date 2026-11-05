import { NextResponse } from "next/server";
import { clientIp, limit } from "@/lib/rate-limit";
import { createToolDraft } from "@/lib/tool-drafts";

/**
 * POST /api/public/tools/draft — "Get paid online with this invoice" on
 * the free generator. Stores the document (and the logo) so the sign-up
 * at /apply?draft=<id> can carry it into the new account
 * (lib/tool-drafts.ts). Answers the draft id; the browser builds the link.
 */
export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  if (ip !== "unknown" && !(await limit(`tools-draft:${ip}`, 20, 60 * 60_000)).ok) {
    return NextResponse.json({ error: "Too many drafts from this connection. Try again later." }, { status: 429 });
  }
  let body: { doc?: unknown; logo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const row = await createToolDraft({ doc: body.doc, logo: body.logo, ip });
  if (!row) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  return NextResponse.json({ id: row.id, href: `/apply?draft=${row.id}` });
}
