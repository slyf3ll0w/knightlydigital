import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { bookingPaymentConfig } from "@/lib/booking-payment-config";
import { hubFormAppearance, loadHubForm } from "@/lib/hub-form";
import BookingStepper from "@/app/book/[slug]/schedule/[type]/BookingStepper";
import RequestForm from "@/app/book/[slug]/RequestForm";
import HubRequestForm from "./HubRequestForm";

const APP_URL = process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com";

/**
 * "Get work done" from the client hub. The plain title + details form by
 * default; when the business picked a client hub form (Settings → Booking &
 * forms), that item renders here with the client already known — no name or
 * contact fields they have on file, no captcha, and the request files under
 * their record (see lib/hub-form.ts).
 */
export default async function HubNewRequestPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const contact = await prisma.contact.findUnique({
    where: { hubToken: token },
    select: {
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      address: true,
      city: true,
      state: true,
      zip: true,
      company: { select: { id: true, slug: true, hubBookingTypeId: true } },
    },
  });
  if (!contact) notFound();

  const item = await loadHubForm(contact.company);
  if (!item) return <HubRequestForm token={token} />;

  const { company, type, pub } = item;
  const appearance = hubFormAppearance(company);
  const address = [contact.address, contact.city, [contact.state, contact.zip].filter(Boolean).join(" ")]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(", ");
  const person = {
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    address,
  };
  const base = `/hub/${token}`;

  return (
    <div>
      <div className="mb-6 flex items-start gap-3">
        <Link href={base} className="mt-1 text-gray-400 hover:text-gray-600" aria-label="Back to your hub">
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0">
          <h2 className="numeral-ledger relative w-fit text-[22px] font-bold text-gray-900">
            {pub.heading}
            <span aria-hidden className="title-rule" />
          </h2>
          {pub.description && <p className="mt-1.5 text-sm text-gray-500">{pub.description}</p>}
        </div>
      </div>

      {pub.mode === "SCHEDULE" ? (
        <BookingStepper
          companySlug={company.slug}
          type={pub}
          company={{ name: company.name, timezone: company.timezone, phone: company.phone, email: company.email, menuHref: "" }}
          appearance={appearance}
          payment={bookingPaymentConfig(type, company)}
          hostedUrl={`${APP_URL}/book/${company.slug}/${pub.slug}`}
          prefill={person}
          hub={{ token }}
        />
      ) : (
        <RequestForm companySlug={company.slug} item={pub} appearance={appearance} hub={{ token, contact: person }} doneHref={`${base}/requests`} />
      )}
    </div>
  );
}
