import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getProcessor } from "@/lib/payments";
import { finixApplicationId, finixEnvironment } from "@/lib/finix";
import SavedCardManager from "./SavedCardManager";

/**
 * Client hub: the cards on file. Lists every saved card (default marked),
 * with make-default/remove actions, and a finix.js tokenization form to add
 * more — no charge happens here; saving a card is how autopay and one-tap
 * future payments work.
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
      savedCards: {
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        select: { id: true, label: true, isDefault: true },
      },
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
      <h2 className="numeral-ledger relative mb-3 w-fit text-[22px] font-bold text-gray-900">
        Payment methods
        <span aria-hidden className="title-rule" />
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        Cards on file let {contact.company.name} charge agreed work without
        chasing you for payment. Your default card is used unless you say
        otherwise — and you can remove any card anytime.
      </p>
      <SavedCardManager
        token={token}
        companyName={contact.company.name}
        cards={contact.savedCards}
        finix={finix}
      />
    </div>
  );
}
