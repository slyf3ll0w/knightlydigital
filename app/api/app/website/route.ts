import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { sanitizeBrief, briefGaps } from "@/lib/website-brief";
import { appBaseUrl, loadWebsiteSummary, scheduleSiteRebuild } from "@/lib/website";
import { alertOperator } from "@/lib/ops-alert";

/**
 * Settings → Website.
 *   GET                       — the owner-side summary (status, brief, gaps, photos)
 *   PATCH { brief }           — save the brief (autosave; any status)
 *   POST { action: "submit" } — "Send to the studio": BRIEF_SUBMITTED + operator email
 */
export async function GET() {
  const actor = await getActor();
  if (!actor || !isManager(actor.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await loadWebsiteSummary(actor.companyId));
}

export async function PATCH(req: NextRequest) {
  const actor = await getActor();
  if (!actor || !isManager(actor.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!body.brief || typeof body.brief !== "object") {
    return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  }
  const brief = sanitizeBrief(body.brief);
  await prisma.website.upsert({
    where: { companyId: actor.companyId },
    create: { companyId: actor.companyId, brief },
    update: { brief },
  });
  return NextResponse.json({ ok: true, brief });
}

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor || !isManager(actor.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.action !== "submit") return NextResponse.json({ error: "Unknown action." }, { status: 400 });

  const summary = await loadWebsiteSummary(actor.companyId);
  const gaps = [...summary.companyGaps, ...briefGaps(summary.brief, summary.photos.length)];
  if (gaps.length) {
    return NextResponse.json(
      { error: `Before sending, add: ${gaps.map((g) => g.label.toLowerCase()).join(", ")}.`, gaps },
      { status: 400 }
    );
  }
  if (summary.status !== "NOT_STARTED") {
    return NextResponse.json({ error: "Your brief is already with the studio." }, { status: 409 });
  }

  const now = new Date();
  const site = await prisma.website.update({
    where: { companyId: actor.companyId },
    data: { status: "BRIEF_SUBMITTED", briefSubmittedAt: now },
    select: { company: { select: { name: true, slug: true } } },
  });
  // The studio queue: one email per company per day
  const base = appBaseUrl();
  await alertOperator(
    `website-brief:${actor.companyId}`,
    `Website brief: ${site.company.name}`,
    `<p><strong>${site.company.name}</strong> sent their website brief.</p>
     <p><a href="${base}/superadmin/websites">Open the studio queue</a> · <a href="${base}/api/public/site/${site.company.slug}">site data</a></p>`,
    24 * 60 * 60_000
  );
  scheduleSiteRebuild(actor.companyId, "brief submitted");
  return NextResponse.json({ ok: true, status: "BRIEF_SUBMITTED", briefSubmittedAt: now.toISOString() });
}
