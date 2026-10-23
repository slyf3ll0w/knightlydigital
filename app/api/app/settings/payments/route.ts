import { reportError } from "@/lib/report-error";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { getProcessor } from "@/lib/payments";
import {
  createOnboardingForm,
  createOnboardingFormLink,
  finixConfigured,
  finixEnvironment,
  FinixError,
} from "@/lib/finix";
import { syncFromFinix } from "@/lib/finix-status";
import { onlinePaymentsHeld, paymentsOnboardingOpen } from "@/lib/payments-gate";
import { squareConfigured, squareEnvironment, squareSignupUrl } from "@/lib/square";
import { squareStatusForCompany } from "@/lib/square-connection";
import { tapToPayEnabled } from "@/lib/tap-to-pay";

/**
 * Online-payments setup.
 *
 * Square (the platform processor): GET answers whether the server holds
 * Square credentials, this company's connection (lib/square-connection.ts)
 * and the partner sign-up link; POST is Finix-only and answers 503.
 *
 * Finix (PAYMENT_PROCESSOR=finix, the 2025–26 processor):
 * GET  — current status, refreshed from Finix (merchant onboarding_state, or
 *        the hosted form's progress before a merchant exists). The Settings
 *        payments card polls this on mount, so state stays fresh without
 *        webhooks — the webhook route is a faster path, not a required one.
 * POST — owner-only: create the company's hosted onboarding form (first click)
 *        or mint a fresh session link (links expire hourly). Returns { url }.
 *        There is deliberately NO in-app way to skip the form, and the E2E
 *        harness provisions its merchant server-side via e2e/provision.mts.
 *
 * Companies Finix hasn't approved — every one while onboarding is closed,
 * or one let in on an invite code (paymentsWaived) — get { comingSoon: true }
 * from GET and a 403 from POST (lib/payments-gate.ts onlinePaymentsHeld).
 */

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const processor = getProcessor();
  if (processor.name === "square") {
    // Square: no underwriting on our side — the owner connects their own
    // Square account (lib/square-connection.ts). Hidden until the server has
    // app credentials, then Connect / Connected + Disconnect.
    if (!squareConfigured()) return NextResponse.json({ available: false });
    const [status, company] = await Promise.all([
      squareStatusForCompany(actor.companyId),
      prisma.company.findUnique({ where: { id: actor.companyId }, select: { surchargeEnabled: true } }),
    ]);
    // The sign-up link follows the company's processing model (Service fee
    // on = the client pays it), because Square's partner links set the rate plan.
    const signupModel = company?.surchargeEnabled ? "serviceFee" : "companyPaid";
    return NextResponse.json({
      available: true,
      processor: "square",
      environment: squareEnvironment(),
      square: status,
      signupUrl: squareSignupUrl(signupModel),
      signupModel,
      tapToPay: tapToPayEnabled(),
    });
  }
  if (processor.name !== "finix" || !finixConfigured()) {
    // Onboarding closed: the card still says Coming soon rather than vanish.
    return NextResponse.json(paymentsOnboardingOpen() ? { available: false } : { available: true, comingSoon: true });
  }

  const held = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { paymentsWaived: true, finixOnboardingState: true, finixOnboardingFormId: true, isTest: true },
  });
  if (held && onlinePaymentsHeld(held)) {
    // A form already with the underwriter can still come back approved —
    // look before saying Coming soon (the webhook is only the faster path).
    const synced = held.finixOnboardingFormId ? await syncFromFinix(actor.companyId) : null;
    if (synced?.state !== "APPROVED") {
      return NextResponse.json({ available: true, comingSoon: true, environment: finixEnvironment() });
    }
  }

  const status = await syncFromFinix(actor.companyId);
  return NextResponse.json({
    available: true,
    environment: finixEnvironment(),
    ...status,
  });
}

export async function POST(req: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.role !== "OWNER") {
    return NextResponse.json(
      { error: "Only the account owner can set up payments." },
      { status: 403 }
    );
  }
  const body = await req.json().catch(() => ({}));

  const processor = getProcessor();
  if (processor.name !== "finix" || !finixConfigured()) {
    return NextResponse.json(
      { error: "Online payments aren't available yet — coming soon." },
      { status: 503 }
    );
  }

  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: {
      name: true,
      legalName: true,
      email: true,
      phone: true,
      finixOnboardingFormId: true,
      finixOnboardingState: true,
      paymentsWaived: true,
      isTest: true,
    },
  });
  if (!company) return NextResponse.json({ error: "Company not found." }, { status: 404 });
  if (company.finixOnboardingState === "APPROVED") {
    return NextResponse.json({ error: "Payments are already set up." }, { status: 400 });
  }
  if (onlinePaymentsHeld(company)) {
    return NextResponse.json(
      { error: "Online payments are coming soon for your account — we'll let you know when you can turn them on." },
      { status: 403 }
    );
  }

  // The old { action: "test-approve" } sandbox shortcut is gone on purpose:
  // everyone goes through the hosted form now (sandbox included).
  if (body.action === "test-approve") {
    return NextResponse.json(
      { error: "Test approval has been removed — complete the verification form instead." },
      { status: 400 }
    );
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com";
  // The form is reachable from Settings and from the /app/activate gate —
  // send the owner back to whichever one they came from.
  const returnPath = body.returnTo === "activate" ? "/app/activate" : "/app/settings";
  const linkParams = {
    returnUrl: `${baseUrl}${returnPath}?payments=submitted`,
    expiredSessionUrl: `${baseUrl}${returnPath}?payments=expired`,
  };

  try {
    // Reuse the existing form (it keeps the owner's saved progress); the hourly
    // link expiry only applies to the session URL, so mint a fresh one per click.
    if (company.finixOnboardingFormId) {
      const link = await createOnboardingFormLink(company.finixOnboardingFormId, linkParams);
      if (link.link_url) return NextResponse.json({ url: link.link_url });
      // Fall through to a new form if Finix wouldn't re-link (e.g. form expired)
    }

    const form = await createOnboardingForm({
      // Underwriting wants the legal entity; the public name may be a DBA or the owner's own name
      businessName: company.legalName?.trim() || company.name,
      email: company.email,
      phone: company.phone,
      ...linkParams,
      tags: { companyId: actor.companyId },
    });
    await prisma.company.update({
      where: { id: actor.companyId },
      data: { finixOnboardingFormId: form.id },
    });
    return NextResponse.json({ url: form.onboarding_link?.link_url });
  } catch (err) {
    reportError("[payments] onboarding form failed", err);
    const message =
      err instanceof FinixError
        ? `Payment setup failed: ${err.message}`
        : "Payment setup failed. Please try again.";
    return NextResponse.json({ error: message }, { status: 424 });
  }
}
