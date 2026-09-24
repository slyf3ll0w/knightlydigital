import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { emailEnabled } from "@/lib/email";
import { companyCanSendSms } from "@/lib/sms";
import { aiEnabled } from "@/lib/ai";
import { atlasAccess, ATLAS_ACCESS_SELECT } from "@/lib/assistant-access";
import { isQuickBooksConfigured } from "@/lib/quickbooks";

export const dynamic = "force-dynamic";

/**
 * GET — everything the builder's pickers need: team members, pipeline
 * stages, custom fields, agreement templates, and which channels are live
 * (so a step can say "texting isn't on yet" before the rule is saved).
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;
  const [users, stages, customFields, agreementTemplates, company, smsLive, qbo] = await Promise.all([
    prisma.user.findMany({ where: { companyId, isActive: true }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
    prisma.pipelineStage.findMany({ where: { companyId, isConverted: false }, select: { id: true, name: true }, orderBy: { sortOrder: "asc" } }),
    prisma.contactFieldDef.findMany({ where: { companyId, isActive: true }, select: { id: true, label: true, type: true, options: true }, orderBy: { sortOrder: "asc" } }),
    prisma.contractTemplate.findMany({ where: { companyId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.company.findUnique({ where: { id: companyId }, select: { ...ATLAS_ACCESS_SELECT, reviewLink: true, timezone: true, assistantName: true } }),
    companyCanSendSms(companyId),
    isQuickBooksConfigured() ? prisma.quickBooksConnection.findUnique({ where: { companyId }, select: { id: true } }) : Promise.resolve(null),
  ]);
  const access = company ? atlasAccess(company) : null;
  return NextResponse.json({
    users,
    stages,
    customFields: customFields.map((f) => ({ id: f.id, label: f.label, type: f.type, options: Array.isArray(f.options) ? (f.options as string[]) : [] })),
    agreementTemplates,
    emailLive: emailEnabled(),
    smsLive,
    reviewLinkSet: Boolean(company?.reviewLink),
    quickbooksConnected: Boolean(qbo),
    atlasAvailable: aiEnabled() && Boolean(access) && access?.level !== "off",
    atlasName: company?.assistantName || "Atlas",
    timezone: company?.timezone ?? "America/Chicago",
  });
}
