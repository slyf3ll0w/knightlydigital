import type { Metadata } from "next";
import Link from "next/link";
import WBFeaturePage from "@/components/wb/WBFeaturePage";
import { pickFeatures } from "@/lib/wb-features";

export const metadata: Metadata = {
  title: "Client Portal — WorkBench",
  description:
    "A magic-link client hub — no account, no password — where clients see upcoming visits, review and pay invoices, sign agreements, message your team, and leave a review. A client experience that looks like a company twice your size.",
};

const features = pickFeatures("clients", [
  "Client hub",
  "Two-way messaging",
  "Automatic notifications",
  "Agreements & contracts",
  "Know when they've looked",
  "Review requests",
]);

const faq = [
  {
    q: "Does the client need to create an account?",
    a: (
      <p>
        No — the hub is a magic link. A client taps the link in a text or
        email and lands straight in their own view, no password to set or
        remember.
      </p>
    ),
  },
  {
    q: "Can clients message us from the hub?",
    a: (
      <p>
        Yes. Messages from the hub land in one shared inbox on your side with
        unread counts, so a conversation lives in one place instead of six
        different text threads.
      </p>
    ),
  },
  {
    q: "Can clients pay their invoice from the hub?",
    a: (
      <p>
        Yes — invoices, quotes, and agreements are all right there, and card
        or ACH payment is one tap away. See the{" "}
        <Link href="/features/payments" className="font-semibold text-[#F86A0A] hover:underline">
          payments page
        </Link>{" "}
        for the full rundown.
      </p>
    ),
  },
  {
    q: "How do review requests work?",
    a: (
      <p>
        After a payment lands, WorkBench asks the happy client for a review
        and points them at your Google listing — while the goodwill from a
        job well done is still fresh.
      </p>
    ),
  },
];

export default function ClientPortalPage() {
  return (
    <WBFeaturePage
      eyebrow="Keep clients close"
      accent="orange"
      title={
        <>
          A client experience that looks like a <span className="text-[#F86A0A]">company twice your size</span>.
        </>
      }
      intro="A magic-link portal — no account, no password — where clients see upcoming visits, review and sign agreements, pay invoices, request more work, and message your team directly. Notifications go out automatically, and you'll know the moment they've looked."
      screenshot={{
        src: "/screens/desktop-invoices.jpg",
        alt: "An invoice a client reviews and pays from a link, as seen from WorkBench",
        kind: "desktop",
        caption: "The same invoice a client opens from their hub link — a placeholder until dedicated hub screenshots are in.",
      }}
      steps={[
        {
          title: "A link goes out",
          body: "Booking confirmations, quotes, and invoices all carry a magic link — no account for the client to set up.",
        },
        {
          title: "They see everything in one place",
          body: "Upcoming visits, invoices, agreements, and a message thread with your team, all in the hub.",
        },
        {
          title: "They act without calling",
          body: "Sign an agreement, pay an invoice, request more work, or send a message — all handled without a phone call to the office.",
        },
      ]}
      features={features}
      faq={faq}
      related={[
        { label: "Payments", href: "/features/payments" },
        { label: "Atlas AI", href: "/features/atlas" },
        { label: "See every feature", href: "/features" },
      ]}
    />
  );
}
