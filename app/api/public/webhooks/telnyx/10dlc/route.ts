import { NextRequest, NextResponse } from "next/server";
import { refreshByTelnyxId } from "@/lib/business-line";

/**
 * Telnyx 10DLC status webhook — set as `webhookURL` on every brand and
 * campaign we create (lib/business-line.ts). The payload is never trusted:
 * all it does is name a brand/campaign id, and we re-read that object from
 * Telnyx ourselves. So no signature is needed for safety — the worst a
 * forged post can do is trigger a rate-limited refresh that the hourly
 * sweep would have done anyway.
 *
 * Telnyx has sent these in a few shapes over the years (bare TCR event,
 * `{ data: { payload } }`); every plausible id field is checked.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ received: true });
  }
  const ids = extractIds(body);
  if (ids.brandId || ids.campaignId) {
    try {
      await refreshByTelnyxId(ids);
    } catch (err) {
      console.error("[telnyx 10dlc] refresh failed:", err);
    }
  }
  return NextResponse.json({ received: true });
}

function extractIds(body: unknown): { brandId: string | null; campaignId: string | null } {
  const out = { brandId: null as string | null, campaignId: null as string | null };
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number) => {
    if (!v || typeof v !== "object" || depth > 4 || seen.has(v)) return;
    seen.add(v);
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "string" && val.length <= 64) {
        const key = k.toLowerCase();
        if (!out.brandId && (key === "brandid" || key === "brand_id" || key === "tcrbrandid")) out.brandId = val;
        if (!out.campaignId && (key === "campaignid" || key === "campaign_id" || key === "tcrcampaignid")) out.campaignId = val;
      } else if (val && typeof val === "object") {
        walk(val, depth + 1);
      }
    }
  };
  walk(body, 0);
  return out;
}
