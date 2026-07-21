import { prisma } from "@/lib/db";
import { getMerchant, getOnboardingForm, listMerchantsForIdentity } from "@/lib/finix";
import { notifyUsers } from "@/lib/push";

/**
 * Refresh a company's Finix onboarding state from the source of truth and
 * persist any change. Shared by the Settings payments card, the /app/activate
 * gate page, and anywhere else that needs live merchant status — the webhook
 * is a faster path for the same data, not a required one.
 */
export async function syncFromFinix(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      finixOnboardingFormId: true,
      finixIdentityId: true,
      finixMerchantId: true,
      finixOnboardingState: true,
    },
  });
  if (!company) return null;

  let { finixIdentityId, finixMerchantId, finixOnboardingState } = company;

  try {
    // Form completed but merchant not yet linked → follow form → identity → merchant
    if (!finixMerchantId && company.finixOnboardingFormId) {
      const form = await getOnboardingForm(company.finixOnboardingFormId);
      if (form.identity_id) {
        finixIdentityId = form.identity_id;
        const merchants = await listMerchantsForIdentity(form.identity_id);
        if (merchants[0]) {
          finixMerchantId = merchants[0].id;
          finixOnboardingState = merchants[0].onboarding_state;
        }
      }
    } else if (finixMerchantId && finixOnboardingState !== "APPROVED") {
      const merchant = await getMerchant(finixMerchantId);
      finixOnboardingState = merchant.onboarding_state;
    }
  } catch (err) {
    // A Finix hiccup shouldn't break the page — serve the stored state
    console.error("[payments] finix status sync failed", err);
  }

  if (
    finixIdentityId !== company.finixIdentityId ||
    finixMerchantId !== company.finixMerchantId ||
    finixOnboardingState !== company.finixOnboardingState
  ) {
    const becameApproved =
      finixOnboardingState === "APPROVED" && company.finixOnboardingState !== "APPROVED";
    await prisma.company.update({
      where: { id: companyId },
      data: { finixIdentityId, finixMerchantId, finixOnboardingState },
    });
    if (becameApproved) {
      const owners = await prisma.user.findMany({
        where: { companyId, role: "OWNER", isActive: true },
        select: { id: true },
      });
      await notifyUsers(
        owners.map((o) => o.id),
        {
          title: "Online payments approved!",
          body: "Your payment account is live — clients can now pay invoices by card or bank online.",
          url: "/app/settings",
          tag: "payments-approved",
        }
      );
    }
  }

  return {
    started: Boolean(company.finixOnboardingFormId),
    state: finixOnboardingState,
    merchantId: finixMerchantId,
  };
}
