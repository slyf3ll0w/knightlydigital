import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { specFromJson } from "@/lib/estimator";
import { checkSpec } from "@/lib/estimator-server";
import { toPortableSpec } from "@/lib/estimator-portable";
import { isIndustry, LISTING_DESCRIPTION, LISTING_SELECT, LISTING_STATUS, shareState } from "@/lib/estimator-library";

/**
 * A tool's Library listing (managers, own tool):
 *   GET    — my listing state ({listed:false} when never shared)
 *   POST   — {industry, description, anonymous}: share, or refresh the
 *            library copy (the spec is snapshotted PORTABLE each time)
 *   DELETE — unlist (status HIDDEN). Rows are never deleted: copies other
 *            companies added stay theirs, and the like count survives a
 *            re-share.
 * A listing Workbench REMOVED can't be re-shared from here (403 + reason).
 */
async function own(id: string, companyId: string) {
  return prisma.estimator.findFirst({ where: { id, companyId }, select: { id: true, companyId: true, name: true, spec: true, isActive: true } });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const tool = await own(id, actor.companyId);
  if (!tool) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const listing = await prisma.estimatorListing.findUnique({ where: { estimatorId: tool.id }, select: LISTING_SELECT });
  return NextResponse.json(shareState(listing));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const tool = await own(id, actor.companyId);
  if (!tool) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const industry = body.industry;
  if (!isIndustry(industry)) return NextResponse.json({ error: "Pick an industry." }, { status: 400 });
  const description = typeof body.description === "string" ? body.description.trim().replace(/\r\n/g, "\n") : "";
  if (description.length < LISTING_DESCRIPTION.min) return NextResponse.json({ error: "Tell people how the tool works — a couple of sentences." }, { status: 400 });
  if (description.length > LISTING_DESCRIPTION.max) return NextResponse.json({ error: `Keep the description under ${LISTING_DESCRIPTION.max} characters.` }, { status: 400 });
  const anonymous = body.anonymous === true;

  const existing = await prisma.estimatorListing.findUnique({ where: { estimatorId: tool.id }, select: { id: true, status: true, removedReason: true } });
  if (existing?.status === LISTING_STATUS.removed) {
    return NextResponse.json({ error: `Workbench removed this listing${existing.removedReason ? `: ${existing.removedReason}` : "."}` }, { status: 403 });
  }

  const spec = specFromJson(tool.spec);
  if (!spec) return NextResponse.json({ error: "This tool's rules no longer compile — fix it before sharing." }, { status: 409 });
  if (spec.lines.length === 0) return NextResponse.json({ error: "The tool needs at least one pricing line before it can be shared." }, { status: 400 });
  const check = await checkSpec(actor.companyId, spec);
  if (!check.ok) return NextResponse.json({ error: check.errors.join(" ") }, { status: 400 });
  const portable = toPortableSpec(check.compiled.spec, check.book);
  if (!portable.ok) return NextResponse.json({ error: portable.errors.join(" ") }, { status: 400 });

  const company = await prisma.company.findUnique({ where: { id: actor.companyId }, select: { name: true } });
  const data = {
    name: tool.name,
    description,
    industry,
    anonymous,
    byName: anonymous ? null : (company?.name ?? null),
    spec: portable.spec as unknown as Prisma.InputJsonValue,
    status: LISTING_STATUS.live,
  };
  const row = existing
    ? await prisma.estimatorListing.update({ where: { id: existing.id }, data, select: LISTING_SELECT })
    : await prisma.estimatorListing.create({ data: { ...data, estimatorId: tool.id, companyId: actor.companyId }, select: LISTING_SELECT });
  return NextResponse.json(shareState(row), { status: existing ? 200 : 201 });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const tool = await own(id, actor.companyId);
  if (!tool) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const existing = await prisma.estimatorListing.findUnique({ where: { estimatorId: tool.id }, select: { id: true, status: true } });
  if (!existing) return NextResponse.json(shareState(null));
  if (existing.status === LISTING_STATUS.removed) return NextResponse.json({ error: "Workbench already removed this listing." }, { status: 403 });
  const row = await prisma.estimatorListing.update({ where: { id: existing.id }, data: { status: LISTING_STATUS.hidden }, select: LISTING_SELECT });
  return NextResponse.json(shareState(row));
}
