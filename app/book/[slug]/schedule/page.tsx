import { notFound } from "next/navigation";
import { companyMetaBySlug } from "@/lib/client-meta";
import { listPublicBookingTypes } from "@/lib/booking-runtime";
import { resolveScheduleAppearance } from "./shell";
import ScheduleFrame from "./ScheduleFrame";
import ScheduleMenu from "./ScheduleMenu";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return companyMetaBySlug(slug, "Book a time");
}

/** /book/[slug]/schedule — the company's booking menu (one card per type). */
export default async function SchedulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [listed, shell] = await Promise.all([listPublicBookingTypes(slug), resolveScheduleAppearance(slug)]);
  if (!listed || !shell) notFound();
  const types = listed.types.filter((t) => t.bookable);
  return (
    <ScheduleFrame company={listed.company} appearance={shell.appearance} subtitle="Pick what you'd like to book">
      <ScheduleMenu companySlug={slug} types={types} appearance={shell.appearance} />
    </ScheduleFrame>
  );
}
