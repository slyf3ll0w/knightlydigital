import type { Metadata } from "next";
import Link from "next/link";
import WBFeaturePage from "@/components/wb/WBFeaturePage";
import { pickFeatures } from "@/lib/wb-features";

export const metadata: Metadata = {
  title: "Payments — WorkBench",
  description:
    "Card and ACH built into every invoice, quote, and booking at one flat rate: 2.9% + 30¢ per card transaction, 0.75% ACH. No monthly fees, saved cards with autopay, automatic reminders, and same-day-ish payouts.",
};

const features = pickFeatures("paid", [
  "Card & ACH built in",
  "One-click invoicing",
  "Saved cards & autopay",
  "Recurring billing, three ways",
  "Payment reminders",
  "Payouts & refunds",
]);

const faq = [
  {
    q: "What does payment processing actually cost?",
    a: (
      <p>
        One flat rate: 2.9% + 30¢ per successful card transaction and 0.75%
        per ACH bank transfer. No monthly fees, no minimum volume, and
        nothing charged on a failed or declined payment. This is also how
        WorkBench funds the free software — see the{" "}
        <Link href="/pricing" className="font-semibold text-[#0B57D8] hover:underline">
          pricing page
        </Link>{" "}
        for the full breakdown.
      </p>
    ),
  },
  {
    q: "Do I have to use WorkBench for payments?",
    a: (
      <p>
        No. Cash and check payments record on any invoice for free, same as
        everything else. Card and ACH are simply built in for when a client
        wants to pay online — on invoices, quotes with deposits, and
        bookings.
      </p>
    ),
  },
  {
    q: "How fast do payouts land in my bank?",
    a: (
      <p>
        Payouts go out on an automatic schedule with no manual step — money
        moves from a paid invoice to your bank account without you touching
        a settlement screen.
      </p>
    ),
  },
  {
    q: "What happens when a saved card gets declined?",
    a: (
      <p>
        Autopay retries on a smart schedule instead of failing silently, and
        the client gets nudged to update their card — so you're not the one
        making the awkward call.
      </p>
    ),
  },
  {
    q: "Can I refund a payment?",
    a: (
      <p>
        Yes — one button, full or partial, right on the payment. The record
        stays clean for your bookkeeper either way.
      </p>
    ),
  },
];

export default function PaymentsPage() {
  return (
    <WBFeaturePage
      eyebrow="Get paid"
      accent="blue"
      title={
        <>
          Money comes back on rails, <span className="text-[#0B57D8]">not on hope</span>.
        </>
      }
      intro="Every invoice, quote, and booking can take card or bank payments at one flat rate — no monthly fees, no minimums. Saved cards autopay recurring work, declines retry automatically, and unpaid invoices get escalating reminders until the money lands."
      screenshot={{
        src: "/screens/desktop-invoices.jpg",
        alt: "WorkBench invoices with card and ACH payment status",
        kind: "desktop",
        caption: "Every invoice shows its payment status at a glance.",
      }}
      steps={[
        {
          title: "Send the invoice",
          body: "Finish a job and send the invoice in one click — the client gets a pay link on their phone.",
        },
        {
          title: "They pay in a tap",
          body: "Card or ACH, right from the link. A card on file means recurring work just charges itself.",
        },
        {
          title: "Money lands, automatically",
          body: "Payouts hit your bank on schedule, unpaid invoices get reminded for you, and refunds are one button if you need one.",
        },
      ]}
      features={features}
      faq={faq}
      related={[
        { label: "Quotes & invoicing", href: "/features/quotes-and-invoicing" },
        { label: "How the pricing works", href: "/pricing" },
        { label: "See every feature", href: "/features" },
      ]}
    />
  );
}
