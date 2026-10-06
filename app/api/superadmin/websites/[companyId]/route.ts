import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSuperadmin } from "@/lib/superadmin";
import { logConsoleAction } from "@/lib/console-audit";
import { rebuildNow } from "@/lib/website";
import type { WebsiteStatus } from "@prisma/client";

const STATUSES: ReadonlySet<string> = new Set(["NOT_STARTED", "BRIEF_SUBMITTED", "IN_STUDIO", "REVIEW", "LIVE"]);

function cleanDomain(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : null;
}

function cleanUrl(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Console → Websites. PATCH one company's site row:
 *   { status?, domain?, pagesProject?, previewUrl?, direction?, notes? } — save
 *   { action: "rebuild" }                                              — dispatch now
 * Setting LIVE stamps liveAt and fills Company.website when it was empty
 * (which also turns off the forced business-details block on the booking
 * page and gives the texting registration a real site).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ companyId: string }> }) {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { companyId } = await params;
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true, website: true } });
  if (!company) return NextResponse.json({ error: "Company not found." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (body.action === "rebuild") {
    await prisma.website.upsert({ where: { companyId }, create: { companyId }, update: {} });
    const r = await rebuildNow(companyId, `console: ${admin.email}`, { force: true });
    logConsoleAction(admin, "website-rebuild", { company, detail: r.ok ? (r.sent ? "sent" : "queued (no token)") : r.error });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 424 });
    return NextResponse.json({ ok: true, sent: r.sent });
  }

  const data: {
    status?: WebsiteStatus;
    domain?: string | null;
    pagesProject?: string | null;
    previewUrl?: string | null;
    direction?: string | null;
    notes?: string | null;
    liveAt?: Date;
  } = {};
  if (typeof body.status === "string" && STATUSES.has(body.status)) data.status = body.status as WebsiteStatus;
  if ("domain" in body) {
    if (body.domain && !cleanDomain(body.domain)) return NextResponse.json({ error: "That doesn't look like a domain (example: harlowair.com)." }, { status: 400 });
    data.domain = cleanDomain(body.domain);
  }
  if ("pagesProject" in body) data.pagesProject = typeof body.pagesProject === "string" ? body.pagesProject.trim().slice(0, 80) || null : null;
  if ("previewUrl" in body) {
    if (body.previewUrl && !cleanUrl(body.previewUrl)) return NextResponse.json({ error: "The preview URL must start with https://." }, { status: 400 });
    data.previewUrl = cleanUrl(body.previewUrl);
  }
  if ("direction" in body) data.direction = typeof body.direction === "string" ? body.direction.trim().slice(0, 120) || null : null;
  if ("notes" in body) data.notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 5000) || null : null;
  if (!Object.keys(data).length) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });

  const existing = await prisma.website.findUnique({ where: { companyId }, select: { status: true, domain: true } });
  const goingLive = data.status === "LIVE" && existing?.status !== "LIVE";
  if (goingLive) data.liveAt = new Date();

  const site = await prisma.website.upsert({ where: { companyId }, create: { companyId, ...data }, update: data });

  const domain = data.domain ?? existing?.domain ?? null;
  if (goingLive && domain && !company.website) {
    await prisma.company.update({ where: { id: companyId }, data: { website: `https://${domain}` } });
  }
  logConsoleAction(admin, "website-update", { company, detail: Object.keys(data).join(", ") });
  return NextResponse.json({ ok: true, site: { ...site, brief: undefined } });
}
