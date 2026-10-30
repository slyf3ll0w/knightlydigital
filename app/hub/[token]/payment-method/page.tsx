import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { clientPayConfig, PAY_CONFIG_SELECT } from "@/lib/pay-client-config";
import SavedCardManager from "./SavedCardManager";

/**
 * Client hub: the cards on file. Lists every saved card (default marked),
 * with make-default/remove actions, and the processor's tokenization form to
 * add more — no charge happens here; saving a card is how autopay and one-tap
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
          surchargeEnabled: true,
          surchargeRate: true,
          ...PAY_CONFIG_SELECT,
        },
      },
    },
  });
  if (!contact) notFound();
  // Disclosed where the card is saved: a card on file pays the company's
  // card surcharge on automatic charges, same as on the pay page.
  const surchargePct =
    contact.company.surchargeEnabled && contact.company.surchargeRate != null && Number(contact.company.surchargeRate) > 0
      ? (Number(contact.company.surchargeRate) * 100).toFixed(1)
      : null;

  // Same gate as the pay page: tokenization only works when this company can
  // charge online (lib/payments-gate.ts canChargeOnline).
  const pay = clientPayConfig(contact.company);

  return (
    <div>
      <h2 className="numeral-ledger relative mb-3 w-fit text-[22px] font-bold text-gray-900">
        Payment methods
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        Cards on file let {contact.company.name} charge agreed work without
        chasing you for payment. Your default card is used unless you say
        otherwise — and you can remove any card anytime.
        {surchargePct && <> Card charges carry a {surchargePct}% card surcharge, shown on each receipt.</>}
      </p>
      <SavedCardManager
        token={token}
        companyName={contact.company.name}
        cards={contact.savedCards}
        pay={pay}
      />
    </div>
  );
}
