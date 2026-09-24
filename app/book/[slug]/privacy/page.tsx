import Link from "next/link";
import { companyMetaBySlug } from "@/lib/client-meta";
import { profileAddress } from "@/lib/business-profile";
import { fmtPhone } from "@/lib/format";
import LegalPage from "../LegalPage";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return companyMetaBySlug(slug, "Privacy Policy");
}

/**
 * /book/[slug]/privacy — the business's own privacy policy. Cited as the
 * privacy link on its 10DLC campaign and next to every SMS consent checkbox;
 * carriers refuse a reseller's policy in place of the brand's. The two
 * sentences about opt-in data are Telnyx's required wording
 * (support.telnyx.com/en/articles/16256133-10dlc-campaign-compliance-guide).
 */
export default async function BusinessPrivacyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <LegalPage
      slug={slug}
      title="Privacy Policy"
      sections={(p) => {
        const contact = [profileAddress(p), p.phone ? fmtPhone(p.phone) : null, p.email].filter(Boolean).join(" · ");
        return [
          {
            heading: "Who we are",
            body: [`This policy explains how ${p.name} ("we", "us") collects and uses information from customers and people who contact us.${contact ? ` You can reach us at ${contact}.` : ""}`],
          },
          {
            heading: "What we collect",
            body: [
              "Your name, phone number, email address and service address; details of the work you ask us to do, such as your messages, answers to our booking questions and photos you send; your appointments, invoices and payments; and the messages we exchange with you.",
              "Card and bank details are entered on our payment processor's secure form and go directly to it. We do not store full card numbers.",
            ],
          },
          {
            heading: "How we use it",
            body: [
              "To schedule and perform the work you request, send you appointment confirmations and reminders, tell you when we are on the way or a visit changes, send invoices and payment receipts, answer your questions, and keep records we are required to keep.",
            ],
          },
          {
            heading: "Text messages",
            body: [
              <>
                We text you only if you agree to it, for example by checking the text-message box on our booking form (it is unchecked by default and not
                required to book), or by asking us to text you. Message frequency varies. Msg &amp; data rates may apply. Reply STOP to opt out at any time
                and HELP for help. See our{" "}
                <Link href={`/book/${slug}/sms-terms`} className="underline">
                  Text Message Terms
                </Link>
                .
              </>,
              "No mobile information will be shared with third parties or affiliates for marketing or promotional purposes. All the above categories exclude text messaging originator opt-in data and consent; this information will not be shared with any third parties.",
            ],
          },
          {
            heading: "Who we share it with",
            body: [
              "Information will not be sold or shared with third parties for promotional or marketing purposes. We use service providers to run our business: WorkBench (workbenchfsm.com), which hosts our booking, scheduling, invoicing and messaging; our payment processor; and our phone and messaging carriers to deliver calls and texts. They act on our behalf and may use your information only to provide those services to us. We may also disclose information when the law requires it.",
            ],
          },
          {
            heading: "How long we keep it",
            body: ["We keep customer records for as long as you are our customer and afterwards as long as needed for taxes, warranties and legal obligations."],
          },
          {
            heading: "Your choices",
            body: [
              `You can ask us to see, correct or delete your information, or to stop contacting you, by ${p.email ? `emailing ${p.email}` : "contacting us"}${p.phone ? ` or calling ${fmtPhone(p.phone)}` : ""}. Reply STOP to any text to stop texts right away.`,
            ],
          },
        ];
      }}
    />
  );
}
