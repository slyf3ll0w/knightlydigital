import type { Metadata } from "next";
import WBFeaturePage from "@/components/wb/WBFeaturePage";
import { pickFeatures } from "@/lib/wb-features";

export const metadata: Metadata = {
  title: "Quotes & Invoicing — WorkBench",
  description:
    "Quotes with e-signature and automatic follow-ups, deposits collected up front, one-click invoicing, and a price book both pull from. From a signed quote to a paid invoice without a spreadsheet in between.",
};

const quoteFeatures = pickFeatures("win", [
  "Quotes with e-signature",
  "Quote follow-ups",
  "Deposits up front",
]);

const invoiceFeatures = pickFeatures("paid", [
  "One-click invoicing",
  "Products & services price book",
]);

const features = [...quoteFeatures, ...invoiceFeatures];

const faq = [
  {
    q: "Can a client approve a quote from their phone?",
    a: (
      <p>
        Yes — line items, optional add-ons they can toggle, discounts, and
        deposits all show clearly, and the client reviews and signs right
        from their phone. An accepted quote converts to a job in one click.
      </p>
    ),
  },
  {
    q: "What happens if a client never responds to a quote?",
    a: (
      <p>
        It gets a friendly automatic nudge at 3 and 7 days — no spreadsheet
        of "need to call back," no quote quietly going cold.
      </p>
    ),
  },
  {
    q: "Do quotes and invoices share pricing?",
    a: (
      <p>
        Yes. Services live in one price book with set rates; quotes and
        invoices both pull from it, so a price change updates everywhere at
        once instead of needing to be re-typed.
      </p>
    ),
  },
  {
    q: "Can I collect a deposit before the job starts?",
    a: (
      <p>
        Yes — a deposit, card or bank transfer, can be collected right at
        quote approval, so the job is funded before the truck rolls.
      </p>
    ),
  },
];

export default function QuotesAndInvoicingPage() {
  return (
    <WBFeaturePage
      eyebrow="Win the work, get paid for it"
      accent="blue"
      title={
        <>
          From a signed quote to a <span className="text-[#0B57D8]">paid invoice</span>, one thread.
        </>
      }
      intro="Quotes go out with e-signature, optional add-ons, and a deposit option — and get a friendly automatic nudge if they sit unanswered. Accepted quotes convert to jobs in one click, and finished jobs invoice in one click too, pulling every price from the same price book."
      screenshot={{
        src: "/screens/desktop-quotes.jpg",
        alt: "A WorkBench quote with line items, awaiting client approval",
        kind: "desktop",
        caption: "A quote with line items and a deposit, waiting on the client's signature.",
      }}
      steps={[
        {
          title: "Build the quote",
          body: "Line items and optional add-ons come straight from your price book; add a deposit if you want the job funded up front.",
        },
        {
          title: "The client signs from their phone",
          body: "They review, toggle any optional add-ons, and e-sign. No follow-up call needed — and if they go quiet, WorkBench nudges them at 3 and 7 days.",
        },
        {
          title: "Accepted → job → invoice",
          body: "One click turns the quote into a job. Finish the job, send the invoice, and the client pays from a link on their phone.",
        },
      ]}
      features={features}
      faq={faq}
      related={[
        { label: "Payments", href: "/features/payments" },
        { label: "Scheduling & dispatch", href: "/features/scheduling-dispatch" },
        { label: "See every feature", href: "/features" },
      ]}
    />
  );
}
