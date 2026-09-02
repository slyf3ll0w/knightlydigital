import { notFound } from "next/navigation";
import { companyMetaBySlug } from "@/lib/client-meta";
import { resolvePublicBookingType, toPublicBookingType } from "@/lib/booking-runtime";
import { resolveScheduleAppearance } from "../shell";
import ScheduleFrame from "../ScheduleFrame";
import BookingStepper from "./BookingStepper";

export async function generateMetadata({ params }: { params: Promise<{ slug: string; type: string }> }) {
  const { slug } = await params;
  return companyMetaBySlug(slug, "Book a time");
}

/** /book/[slug]/schedule/[type] — the booking page for one type. */
export default async function ScheduleTypePage({ params }: { params: Promise<{ slug: string; type: string }> }) {
  const { slug, type: typeSlug } = await params;
  const [resolved, shell] = await Promise.all([resolvePublicBookingType(slug, typeSlug), resolveScheduleAppearance(slug)]);
  if (!resolved || !shell) notFound();
  const { company, type } = resolved;
  const pub = toPublicBookingType(type, company);
  return (
    <ScheduleFrame company={company} appearance={shell.appearance} title={pub.name} subtitle={pub.description ?? company.name} wide>
      <BookingStepper
        companySlug={slug}
        type={pub}
        company={{ name: company.name, timezone: company.timezone, phone: company.phone, email: company.email, menuHref: `/book/${slug}/schedule` }}
        appearance={shell.appearance}
      />
    </ScheduleFrame>
  );
}
