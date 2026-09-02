import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPasswordForUser } from "@/lib/account";
import { getSuperadmin } from "@/lib/superadmin";
import { limit } from "@/lib/rate-limit";
import { companyHasProtectedUser, deleteCompanyCascade } from "@/lib/company-delete";

/**
 * Superadmin account controls.
 *
 * PATCH  — suspend / reinstate (reversible: data untouched, the tenant app and
 *          public surfaces go dark until reinstated), payments-gate waiver, and
 *          the Atlas assistant override (on / off / back to default policy).
 * DELETE — permanent removal behind the heaviest gate in the product: the
 *          exact slug retyped, the superadmin's own password re-verified, and
 *          for companies with real data ("large": any payments, or >25
 *          contacts, or >25 jobs) the literal phrase PERMANENTLY DELETE as a
 *          third factor. Rate-limited so the password check can't be farmed.
 */

const DELETE_PHRASE = "PERMANENTLY DELETE";

/** Real-data threshold: above this the delete gate demands the typed phrase. */
async function dataFootprint(companyId: string) {
  const [users, contacts, jobs, invoices, payments] = await Promise.all([
    prisma.user.count({ where: { companyId } }),
    prisma.contact.count({ where: { companyId } }),
    prisma.job.count({ where: { companyId } }),
    prisma.invoice.count({ where: { companyId } }),
    prisma.payment.count({ where: { companyId } }),
  ]);
  const large = payments > 0 || contacts > 25 || jobs > 25;
  return { users, contacts, jobs, invoices, payments, large };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = body.action;
  if (
    action !== "suspend" &&
    action !== "reinstate" &&
    action !== "waive-payments" &&
    action !== "require-payments" &&
    action !== "assistant-on" &&
    action !== "assistant-off" &&
    action !== "assistant-default" &&
    action !== "atlas-plan-grant" &&
    action !== "atlas-plan-revoke" &&
    action !== "atlas-plan-reset" &&
    action !== "atlas-trial-reset" &&
    action !== "addon-show" &&
    action !== "addon-hide" &&
    action !== "addon-grant" &&
    action !== "addon-revoke"
  ) {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const company = await prisma.company.findUnique({
    where: { id },
    select: { id: true, name: true, suspendedAt: true },
  });
  if (!company) return NextResponse.json({ error: "Company not found." }, { status: 404 });

  // Payment-verification waiver: exempts the company from the /app/activate
  // underwriting gate (test accounts, comped users).
  if (action === "waive-payments" || action === "require-payments") {
    const waived = action === "waive-payments";
    await prisma.company.update({ where: { id }, data: { paymentsWaived: waived } });
    console.warn(
      `[superadmin] payments gate ${waived ? "WAIVED" : "REQUIRED"} for "${company.name}" (${id}) by ${admin.email}`
    );
    return NextResponse.json({ success: true });
  }

  // Atlas override: force the assistant on/off for this company, or clear the
  // override back to the default policy (lib/assistant-access.ts).
  if (action === "assistant-on" || action === "assistant-off" || action === "assistant-default") {
    const assistantEnabled =
      action === "assistant-default" ? null : action === "assistant-on";
    await prisma.company.update({ where: { id }, data: { assistantEnabled } });
    console.warn(
      `[superadmin] assistant ${assistantEnabled === null ? "reset to DEFAULT" : assistantEnabled ? "forced ON" : "forced OFF"} for "${company.name}" (${id}) by ${admin.email}`
    );
    return NextResponse.json({ success: true });
  }

  // Atlas paid plan (lib/assistant-billing.ts) — not sold yet, so this is the
  // only way to activate it: grant starts a metered plan anchored now, revoke
  // ends it (trial state is untouched), reset refills the current period.
  if (action === "atlas-plan-grant" || action === "atlas-plan-revoke" || action === "atlas-plan-reset") {
    const data =
      action === "atlas-plan-grant"
        ? { atlasPlanActiveAt: new Date(), atlasPeriodStart: new Date(), atlasPeriodTokensUsed: 0 }
        : action === "atlas-plan-revoke"
          ? { atlasPlanActiveAt: null, atlasPlanLiverySubId: null, atlasPeriodStart: null, atlasPeriodTokensUsed: 0 }
          : { atlasPeriodTokensUsed: 0 };
    await prisma.company.update({ where: { id }, data });
    console.warn(`[superadmin] atlas plan ${action.replace("atlas-plan-", "")} for "${company.name}" (${id}) by ${admin.email}`);
    return NextResponse.json({ success: true });
  }

  // Atlas free trial reset: back to the untried paywall with a fresh
  // allowance — the way to re-run a trial burn-down on a test company.
  if (action === "atlas-trial-reset") {
    await prisma.company.update({
      where: { id },
      data: { atlasTrialStartedAt: null, atlasTrialTokensUsed: 0 },
    });
    console.warn(`[superadmin] atlas trial reset for "${company.name}" (${id}) by ${admin.email}`);
    return NextResponse.json({ success: true });
  }

  // Premium add-on (lib/addon.ts): show/hide flips the VISIBILITY switch
  // (upsell page + settings link); grant/revoke overrides the ENTITLEMENT the
  // Livery webhook normally manages — the escape hatch for missed webhooks,
  // comped accounts, or a manual walk-back.
  if (action === "addon-show" || action === "addon-hide") {
    const enabled = action === "addon-show";
    await prisma.company.update({ where: { id }, data: { addonEnabled: enabled } });
    console.warn(
      `[superadmin] add-on ${enabled ? "SHOWN to" : "HIDDEN from"} "${company.name}" (${id}) by ${admin.email}`
    );
    return NextResponse.json({ success: true });
  }
  if (action === "addon-grant" || action === "addon-revoke") {
    const grant = action === "addon-grant";
    await prisma.company.update({
      where: { id },
      data: grant ? { addonActiveAt: new Date() } : { addonActiveAt: null, addonLiverySubId: null },
    });
    console.warn(
      `[superadmin] add-on entitlement ${grant ? "GRANTED (manual)" : "REVOKED"} for "${company.name}" (${id}) by ${admin.email}`
    );
    return NextResponse.json({ success: true });
  }

  if (action === "suspend") {
    if (await companyHasProtectedUser(id)) {
      return NextResponse.json({ error: "The demo company can't be suspended." }, { status: 403 });
    }
    const reason =
      typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 500) : null;
    await prisma.company.update({
      where: { id },
      data: { suspendedAt: company.suspendedAt ?? new Date(), suspendedReason: reason },
    });
    console.warn(`[superadmin] company SUSPENDED: "${company.name}" (${id}) by ${admin.email}${reason ? ` — ${reason}` : ""}`);
  } else {
    await prisma.company.update({
      where: { id },
      data: { suspendedAt: null, suspendedReason: null },
    });
    console.warn(`[superadmin] company REINSTATED: "${company.name}" (${id}) by ${admin.email}`);
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  // 5 attempts/hour — this endpoint verifies a password and must not be
  // farmable, even by a compromised superadmin session.
  const rl = limit(`superadmin-delete:${admin.id}`, 5, 60 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts — try again later." }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const confirmSlug = typeof body.confirmSlug === "string" ? body.confirmSlug.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const phrase = typeof body.phrase === "string" ? body.phrase.trim() : "";

  const company = await prisma.company.findUnique({
    where: { id },
    select: { id: true, name: true, slug: true },
  });
  if (!company) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }
  if (await companyHasProtectedUser(id)) {
    return NextResponse.json({ error: "The demo company can't be deleted." }, { status: 403 });
  }
  if (confirmSlug !== company.slug) {
    return NextResponse.json(
      { error: "The slug you typed doesn't match exactly." },
      { status: 400 }
    );
  }
  if (!password || !(await verifyPasswordForUser(admin.id, password))) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 403 });
  }
  const footprint = await dataFootprint(id);
  if (footprint.large && phrase !== DELETE_PHRASE) {
    return NextResponse.json(
      {
        error: `This company has real data (${footprint.payments} payments, ${footprint.contacts} contacts, ${footprint.jobs} jobs). Type "${DELETE_PHRASE}" to confirm.`,
        requiresPhrase: true,
      },
      { status: 428 }
    );
  }

  await deleteCompanyCascade(id);
  console.warn(
    `[superadmin] company DELETED: "${company.name}" (${id}, /${company.slug}) by ${admin.email} — footprint: ${JSON.stringify(footprint)}`
  );
  return NextResponse.json({ success: true });
}
