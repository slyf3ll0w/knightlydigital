import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { getProcessor } from "@/lib/payments";
import {
  createOnboardingForm,
  createOnboardingFormLink,
  provisionSandboxMerchant,
  finixConfigured,
  finixEnvironment,
  FinixError,
} from "@/lib/finix";
import { syncFromFinix } from "@/lib/finix-status";

/**
 * Online-payments setup (Finix merchant onboarding).
 *
 * GET  — current status, refreshed from Finix (merchant onboarding_state, or
 *        the hosted form's progress before a merchant exists). The Settings
 *        payments card polls this on mount, so state stays fresh without
 *        webhooks — the webhook route is a faster path, not a required one.
 * POST — owner-only: create the company's hosted onboarding form (first click)
 *        or mint a fresh session link (links expire hourly). Returns { url }.
 *        Body { action: "test-approve" } (SANDBOX ONLY) skips the form and
 *        provisions a merchant from canned test data instead — auto-approves
 *        in ~2 minutes. provisionSandboxMerchant throws in live mode, so this
 *        can never bypass real KYC.
 */

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const processor = getProcessor();
  if (processor.name !== "finix" || !finixConfigured()) {
    return NextResponse.json({ available: false });
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
      email: true,
      phone: true,
      finixOnboardingFormId: true,
      finixOnboardingState: true,
    },
  });
  if (!company) return NextResponse.json({ error: "Company not found." }, { status: 404 });
  if (company.finixOnboardingState === "APPROVED") {
    return NextResponse.json({ error: "Payments are already set up." }, { status: 400 });
  }

  if (body.action === "test-approve") {
    if (finixEnvironment() !== "sandbox") {
      return NextResponse.json(
        { error: "Test approval only exists in sandbox mode." },
        { status: 400 }
      );
    }
    try {
      const result = await provisionSandboxMerchant({
        businessName: company.name,
        email: company.email,
        phone: company.phone,
      });
      await prisma.company.update({
        where: { id: actor.companyId },
        data: {
          finixIdentityId: result.identityId,
          finixMerchantId: result.merchantId,
          finixOnboardingState: result.onboardingState,
        },
      });
      return NextResponse.json({ testApproved: true, state: result.onboardingState });
    } catch (err) {
      console.error("[payments] sandbox test approval failed", err);
      const message =
        err instanceof FinixError ? `Test approval failed: ${err.message}` : "Test approval failed.";
      return NextResponse.json({ error: message }, { status: 502 });
    }
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
      businessName: company.name,
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
    console.error("[payments] onboarding form failed", err);
    const message =
      err instanceof FinixError
        ? `Payment setup failed: ${err.message}`
        : "Payment setup failed. Please try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
