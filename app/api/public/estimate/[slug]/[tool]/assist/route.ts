import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolvePublicEstimator } from "@/lib/estimator-server";
import { readAssistImage, runAssist } from "@/lib/estimator-assist";
import { PUBLIC_PHOTO_ASSIST_DAILY_CAP } from "@/lib/estimator-public";
import { limit, clientIp } from "@/lib/rate-limit";

/**
 * POST /api/public/estimate/[companySlug]/[toolSlug]/assist
 *   { description?, imageBase64?, imageMime? }
 * The website form's "snap a photo / describe it" fill-in — the ONE public
 * step that spends the owner's Atlas tokens, so it only exists when the
 * owner turned `photoAssist` on for this form AND the tool has `assist`,
 * and it is capped: a few per visitor per hour, PUBLIC_PHOTO_ASSIST_DAILY_CAP
 * per company per day. The ledger names the company's owner. The visitor
 * gets input values and a note — never token counts or meter state.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string; tool: string }> }) {
  const { slug, tool } = await params;
  const preview = req.nextUrl.searchParams.get("preview") === "1";
  const pub = await resolvePublicEstimator(slug, tool, { preview });
  if (!pub) return NextResponse.json({ error: "This form isn't available." }, { status: 404 });
  if (!pub.config.photoAssist || !pub.spec.assist) return NextResponse.json({ error: "This form doesn't take photos." }, { status: 404 });

  const ip = clientIp(req.headers);
  if (!(await limit(`public-estimate-assist-ip:${ip}`, 6, 3600_000)).ok) {
    return NextResponse.json({ error: "Too many tries — please fill in the answers by hand." }, { status: 429 });
  }
  if (!(await limit(`public-estimate-assist:${pub.company.id}`, PUBLIC_PHOTO_ASSIST_DAILY_CAP, 86400_000)).ok) {
    return NextResponse.json({ error: "Photo fill-in isn't available right now — please answer the questions by hand." }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 2000) : "";
  const image = readAssistImage(body);
  if (image === "bad") return NextResponse.json({ error: "That photo couldn't be read — use a JPEG, PNG or WebP under 2 MB." }, { status: 400 });
  if (!image && description.length < 8) return NextResponse.json({ error: "Attach a photo or describe the job in a sentence." }, { status: 400 });

  // The owner pays and is named in the ledger
  const owner = await prisma.user.findFirst({
    where: { companyId: pub.company.id, role: { in: ["OWNER", "ADMIN"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!owner) return NextResponse.json({ error: "This form doesn't take photos." }, { status: 404 });

  const out = await runAssist({ id: owner.id, companyId: pub.company.id }, pub.spec, pub.row.name, description, image);
  if (!out.ok) {
    // Locked meter, no AI, model hiccup — all read the same to a visitor
    return NextResponse.json({ error: "Photo fill-in isn't available right now — please answer the questions by hand." }, { status: out.status === 400 ? 400 : 503 });
  }
  if (!pub.previewing) void prisma.estimator.update({ where: { id: pub.row.id }, data: { assists: { increment: 1 } } }).catch(() => {});
  return NextResponse.json({ values: out.values, notes: out.notes, skipped: out.skipped });
}
