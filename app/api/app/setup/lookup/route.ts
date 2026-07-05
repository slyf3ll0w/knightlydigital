import { NextRequest, NextResponse } from "next/server";
import { getActor, isManager } from "@/lib/permissions";
import { limit } from "@/lib/rate-limit";
import { aiEnabled } from "@/lib/ai";
import { lookupBusiness, lookupFromWebsite } from "@/lib/business-lookup";
import { normalizeWebsiteUrl } from "@/lib/website-info";

/**
 * POST — "Find my business" for the setup wizard: grounded search for the
 * company's public listing + website branding candidates. Pure read; the
 * owner confirms everything on screen before any of it is applied.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!aiEnabled()) {
    return NextResponse.json({ business: null });
  }

  // each lookup is 1-2 external AI calls — keep it bounded
  const rl = limit(`setup-lookup:${actor.companyId}`, 10, 60 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many searches — try again in ${Math.ceil(rl.retryAfterSeconds / 60)} min.` },
      { status: 429 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const name = s(body.name, 120);
  const website = normalizeWebsiteUrl(body.website) ?? "";
  if (!name && !website) {
    return NextResponse.json({ error: "Type your business name or website first." }, { status: 400 });
  }

  // Name → grounded search (their typed website wins over anything cited);
  // no hit (thin web presence / no Google profile) but a website given →
  // brand straight from the site instead.
  let business = name
    ? await lookupBusiness(name, s(body.city, 80), s(body.state, 40), s(body.industry, 80), website)
    : null;
  if (!business?.found && website) {
    business = await lookupFromWebsite(website, name);
  }
  return NextResponse.json({ business });
}
