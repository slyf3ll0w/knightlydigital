import { notFound } from "next/navigation";
import { companyMetaBySlug } from "@/lib/client-meta";
import { resolvePublicBookingType, toPublicBookingType } from "@/lib/booking-runtime";
import { resolveScheduleAppearance } from "@/app/book/[slug]/schedule/shell";
import BookingStepper from "@/app/book/[slug]/schedule/[type]/BookingStepper";
import { bookingPaymentConfig } from "@/lib/booking-payment-config";
import EmbedAutoResize from "../../EmbedAutoResize";
import EmbedScheduleShell from "../EmbedScheduleShell";

export async function generateMetadata({ params }: { params: Promise<{ slug: string; type: string }> }) {
  const { slug } = await params;
  return companyMetaBySlug(slug, "Book a time");
}

type EmbedParams = { theme?: string; transparent?: string; accent?: string; font?: string };

/** Chrome-less booking page for one type — same stepper, posts its height to the host. */
export default async function EmbedScheduleTypePage({ params, searchParams }: { params: Promise<{ slug: string; type: string }>; searchParams: Promise<EmbedParams> }) {
  const { slug, type: typeSlug } = await params;
  const sp = await searchParams;
  const [resolved, shell] = await Promise.all([resolvePublicBookingType(slug, typeSlug), resolveScheduleAppearance(slug, sp)]);
  if (!resolved || !shell) notFound();
  const { company, type } = resolved;
  const pub = toPublicBookingType(type, company);
  const payment = bookingPaymentConfig(type, company);
  return (
    <EmbedScheduleShell appearance={shell.appearance}>
      <EmbedAutoResize slug={`${slug}/schedule/${typeSlug}`} />
      <BookingStepper
        companySlug={slug}
        type={pub}
        company={{ name: company.name, timezone: company.timezone, phone: company.phone, email: company.email, menuHref: `/embed/${slug}/schedule` }}
        appearance={shell.appearance}
        payment={payment}
        hostedUrl={`${process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com"}/book/${slug}/schedule/${typeSlug}`}
        embed
      />
    </EmbedScheduleShell>
  );
}
