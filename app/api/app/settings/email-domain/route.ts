import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import {
  emailDomainsEnabled,
  createDomain,
  getDomain,
  verifyDomain,
  deleteDomain,
  normalizeStatus,
  sanitizeDomain,
  sanitizeLocal,
  EmailDomainError,
} from "@/lib/email-domains";

/**
 * Custom sending domain (Settings → Email domain card).
 *
 * GET    — status + the DNS records to publish, re-synced from Resend on every
 *          load (same self-healing pattern as the payments card — no webhook
 *          needed). { available: false } while EMAIL_DOMAINS_ENABLED is off,
 *          which also hides the Settings card entirely.
 * POST   — owner-only: claim a domain { domain, fromLocal? }. Registers it
 *          with Resend and stores the records to publish.
 * PATCH  — { action: "verify" } asks Resend to re-check DNS now;
 *          { fromLocal } changes the From local part (quotes@ vs notifications@).
 * DELETE — owner-only: remove the domain; sends fall back to the platform
 *          address immediately.
 */

type DomainView = {
  available: true;
  domain: string | null;
  status: string | null;
  records: unknown;
  fromLocal: string;
  fromAddress: string | null;
};

function view(c: {
  emailDomain: string | null;
  emailDomainStatus: string | null;
  emailDomainRecords: unknown;
  emailFromLocal: string | null;
}): DomainView {
  const local = c.emailFromLocal || "notifications";
  return {
    available: true,
    domain: c.emailDomain,
    status: c.emailDomainStatus,
    records: c.emailDomainRecords ?? [],
    fromLocal: local,
    fromAddress: c.emailDomain ? `${local}@${c.emailDomain}` : null,
  };
}

const COMPANY_SELECT = {
  emailDomain: true,
  emailDomainId: true,
  emailDomainStatus: true,
  emailDomainRecords: true,
  emailFromLocal: true,
} as const;

async function requireManager() {
  const actor = await getActor();
  if (!actor) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!isManager(actor.role))
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { actor };
}

/** Pull fresh status/records from Resend and mirror them onto the company. */
async function syncFromResend(companyId: string, domainId: string) {
  try {
    const remote = await getDomain(domainId);
    return await prisma.company.update({
      where: { id: companyId },
      data: {
        emailDomainStatus: normalizeStatus(remote.status),
        emailDomainRecords: remote.records as object[],
      },
      select: COMPANY_SELECT,
    });
  } catch (err) {
    // Domain deleted on the Resend side → clear our mirror
    if (err instanceof EmailDomainError && err.status === 404) {
      return await prisma.company.update({
        where: { id: companyId },
        data: {
          emailDomain: null,
          emailDomainId: null,
          emailDomainStatus: null,
          emailDomainRecords: [],
        },
        select: COMPANY_SELECT,
      });
    }
    console.error("[email-domain] sync failed:", err);
    return null;
  }
}

export async function GET() {
  const { actor, error } = await requireManager();
  if (error) return error;
  if (!emailDomainsEnabled()) return NextResponse.json({ available: false });

  let company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: COMPANY_SELECT,
  });
  if (!company) return NextResponse.json({ error: "Company not found." }, { status: 404 });

  if (company.emailDomainId) {
    company = (await syncFromResend(actor.companyId, company.emailDomainId)) ?? company;
  }
  return NextResponse.json(view(company));
}

export async function POST(req: NextRequest) {
  const { actor, error } = await requireManager();
  if (error) return error;
  if (actor.role !== "OWNER")
    return NextResponse.json({ error: "Only the owner can set up a sending domain." }, { status: 403 });
  if (!emailDomainsEnabled())
    return NextResponse.json({ error: "Custom sending domains aren't enabled yet." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const domain = sanitizeDomain(String(body?.domain ?? ""));
  if (!domain)
    return NextResponse.json(
      { error: "Enter a domain you own, like summitplumbing.com." },
      { status: 400 }
    );
  const fromLocal = body?.fromLocal ? sanitizeLocal(String(body.fromLocal)) : "notifications";
  if (!fromLocal)
    return NextResponse.json(
      { error: "The address prefix can only use letters, numbers, dots, and dashes." },
      { status: 400 }
    );

  const existing = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { emailDomainId: true },
  });
  if (existing?.emailDomainId)
    return NextResponse.json(
      { error: "Remove the current domain before adding a different one." },
      { status: 400 }
    );
  const taken = await prisma.company.findUnique({
    where: { emailDomain: domain },
    select: { id: true },
  });
  if (taken)
    return NextResponse.json(
      { error: "That domain is already connected to another account." },
      { status: 400 }
    );

  try {
    const created = await createDomain(domain);
    const company = await prisma.company.update({
      where: { id: actor.companyId },
      data: {
        emailDomain: domain,
        emailDomainId: created.id,
        emailDomainStatus: normalizeStatus(created.status),
        emailDomainRecords: created.records as object[],
        emailFromLocal: fromLocal,
      },
      select: COMPANY_SELECT,
    });
    return NextResponse.json(view(company));
  } catch (err) {
    if (err instanceof EmailDomainError)
      return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[email-domain] create failed:", err);
    return NextResponse.json({ error: "Couldn't register the domain — try again." }, { status: 502 });
  }
}

export async function PATCH(req: NextRequest) {
  const { actor, error } = await requireManager();
  if (error) return error;
  if (!emailDomainsEnabled()) return NextResponse.json({ available: false });

  const body = await req.json().catch(() => ({}));
  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: COMPANY_SELECT,
  });
  if (!company?.emailDomainId)
    return NextResponse.json({ error: "No sending domain is set up." }, { status: 400 });

  if (body?.action === "verify") {
    try {
      await verifyDomain(company.emailDomainId);
    } catch (err) {
      if (!(err instanceof EmailDomainError && err.status === 404)) {
        console.error("[email-domain] verify failed:", err);
      }
    }
    const synced = await syncFromResend(actor.companyId, company.emailDomainId);
    return NextResponse.json(view(synced ?? company));
  }

  if (typeof body?.fromLocal === "string") {
    const fromLocal = sanitizeLocal(body.fromLocal);
    if (!fromLocal)
      return NextResponse.json(
        { error: "The address prefix can only use letters, numbers, dots, and dashes." },
        { status: 400 }
      );
    const updated = await prisma.company.update({
      where: { id: actor.companyId },
      data: { emailFromLocal: fromLocal },
      select: COMPANY_SELECT,
    });
    return NextResponse.json(view(updated));
  }

  return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
}

export async function DELETE() {
  const { actor, error } = await requireManager();
  if (error) return error;
  if (actor.role !== "OWNER")
    return NextResponse.json({ error: "Only the owner can remove the sending domain." }, { status: 403 });

  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { emailDomainId: true },
  });
  if (company?.emailDomainId) {
    try {
      await deleteDomain(company.emailDomainId);
    } catch (err) {
      // Already gone at Resend is fine — we're clearing our side regardless
      if (!(err instanceof EmailDomainError && err.status === 404)) {
        console.error("[email-domain] delete failed:", err);
      }
    }
  }
  await prisma.company.update({
    where: { id: actor.companyId },
    data: {
      emailDomain: null,
      emailDomainId: null,
      emailDomainStatus: null,
      emailDomainRecords: [],
      emailFromLocal: null,
    },
  });
  return NextResponse.json({ ok: true });
}
