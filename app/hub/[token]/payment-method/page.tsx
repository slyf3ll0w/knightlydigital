import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { clientPayConfig, PAY_CONFIG_SELECT } from "@/lib/pay-client-config";
import SavedCardManager from "./SavedCardManager";
import { SERVICE_FEE_CARD } from "@/lib/service-fee";

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
          ...PAY_CONFIG_SELECT,
        },
      },
    },
  });
  if (!contact) notFound();
  // Disclosed where the card is saved: a card on file pays the company's
  // card surcharge on automatic charges, same as on the pay page.
  const feeOn = contact.company.surchargeEnabled;

  // Same gate as the pay page: tokenization only works when this company can
  // charge online (lib/payments-gate.ts canChargeOnline).
  const pay = clientPayConfig(contact.company);

  return (
    <div>
      <Link href={`/hub/${token}/invoices`} className="hk-back">
        <ArrowLeft size={16} strokeWidth={2.4} /> Invoices
      </Link>
      <h1 className="hk-title">Payment methods</h1>
      <p className="hk-note mb-5 max-w-xl leading-snug">
        Cards on file let {contact.company.name} charge agreed work without
        chasing you for payment. Your default card is used unless you say
        otherwise — and you can remove any card anytime.
        {feeOn && <> Card charges carry the {SERVICE_FEE_CARD} service fee, shown on each receipt.</>}
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
