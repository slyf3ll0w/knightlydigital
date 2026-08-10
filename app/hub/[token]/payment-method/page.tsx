import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getProcessor } from "@/lib/payments";
import { finixApplicationId, finixEnvironment } from "@/lib/finix";
import SavedCardManager from "./SavedCardManager";

/**
 * Client hub: the card on file. Shows the saved card with a remove action,
 * and a finix.js tokenization form to add/replace one — no charge happens
 * here; saving a card is how autopay and one-tap future payments work.
 */
export default async function HubPaymentMethodPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const contact = await prisma.contact.findUnique({
    where: { hubToken: token },
    select: {
      savedCardLabel: true,
      savedCardAt: true,
      company: {
        select: {
          name: true,
          brandColorSecondary: true,
          brandColor: true,
          finixMerchantId: true,
          finixOnboardingState: true,
        },
      },
    },
  });
  if (!contact) notFound();

  // Same gate as the pay page: tokenization only works when this company's
  // merchant is approved and the platform processor is Finix.
  let finix: { applicationId: string; environment: "sandbox" | "live" } | null = null;
  const processor = getProcessor();
  if (
    processor.name === "finix" &&
    processor.live &&
    contact.company.finixMerchantId &&
    contact.company.finixOnboardingState === "APPROVED"
  ) {
    finix = { applicationId: finixApplicationId(), environment: finixEnvironment() };
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Payment method</h2>
      <p className="text-sm text-gray-500 mb-4">
        A card on file lets {contact.company.name} charge agreed work without
        chasing you for payment — and you can remove it anytime.
      </p>
      <SavedCardManager
        token={token}
        companyName={contact.company.name}
        savedLabel={contact.savedCardLabel}
        finix={finix}
      />
    </div>
  );
}
