import Link from "next/link";
import { companyMetaBySlug } from "@/lib/client-meta";
import { fmtPhone } from "@/lib/format";
import LegalPage from "../LegalPage";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return companyMetaBySlug(slug, "Text Message Terms");
}

/**
 * /book/[slug]/sms-terms — the business's own texting program terms: the
 * terms link on its 10DLC campaign, next to every consent checkbox, and in
 * the HELP reply. Mirrors what the campaign files (campaignCopy +
 * campaignKeywordReplies in lib/business-line.ts): informational texts
 * only, no marketing.
 */
export default async function BusinessSmsTermsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <LegalPage
      slug={slug}
      title="Text Message Terms"
      sections={(p) => {
        const reach = [p.phone ? `call ${fmtPhone(p.phone)}` : null, p.email ? `email ${p.email}` : null].filter(Boolean).join(" or ");
        return [
          {
            heading: "The program",
            body: [
              `${p.name} texts its customers about their own service: appointment confirmations and reminders, arrival and schedule updates, links to view and pay invoices, payment receipts, and replies to messages you send us. We do not send marketing or promotional texts.`,
            ],
          },
          {
            heading: "How you opt in",
            body: [
              `By checking the text-message box on our booking or service-request form (unchecked by default and not required to book), by asking us to text you when you book by phone or in person, or by texting us first. Consent is not a condition of purchase.`,
            ],
          },
          {
            heading: "Frequency and cost",
            body: ["Message frequency varies with your appointments and requests; a typical job produces two to six messages. Msg & data rates may apply."],
          },
          {
            heading: "How to stop",
            body: [
              `Reply STOP to any message to opt out; you will get one confirmation and no further texts. Reply START to opt back in. Reply HELP for help${reach ? `, or ${reach}` : ""}.`,
            ],
          },
          {
            heading: "Carriers",
            body: ["Carriers are not liable for delayed or undelivered messages."],
          },
          {
            heading: "Privacy",
            body: [
              <>
                We do not share your mobile number or text-messaging consent with third parties for marketing. See our{" "}
                <Link href={`/book/${slug}/privacy`} className="underline">
                  Privacy Policy
                </Link>
                .
              </>,
            ],
          },
        ];
      }}
    />
  );
}
