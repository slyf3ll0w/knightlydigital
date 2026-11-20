import { NextRequest, NextResponse } from "next/server";
import { publishTheme, themeRowJson } from "@/lib/client-theme-store";
import { publishTargetOf } from "@/lib/client-theme-requests";
import { themeActor, themeErrorResponse } from "@/lib/client-theme-route";

/**
 * POST — put a look live on the company's client pages (portal login,
 * portal, booking page, forms). Body, exactly one of:
 *   { draft: true }      publish the draft
 *   { version: n }       put version n back (saved as a new version)
 *   { reset: true }      back to the default look (colors + logo)
 * Owners/admins on Pro. This is the endpoint the Publish button, History →
 * "Use this one", Reset to default AND the Atlas / connector approval cards
 * (publish_client_theme, revert_client_theme) call — a person's tap every time.
 */
export async function POST(req: NextRequest) {
  const who = await themeActor();
  if ("error" in who) return who.error;
  const target = publishTargetOf(await req.json().catch(() => null));
  if (!target) return NextResponse.json({ error: "Say what to publish: { draft: true }, { version: n } or { reset: true }." }, { status: 400 });
  try {
    const out = await publishTheme(who.actor.companyId, target, { userId: who.actor.id, source: "app" });
    return NextResponse.json({ success: true, published: out.published ? themeRowJson(out.published) : null, problems: out.problems });
  } catch (err) {
    return themeErrorResponse(err, "publish");
  }
}
