import { notFound } from "next/navigation";
import { companyMetaBySlug } from "@/lib/client-meta";
import { listPublicBookingTypes } from "@/lib/booking-runtime";
import { resolveScheduleAppearance } from "@/app/book/[slug]/schedule/shell";
import ScheduleMenu from "@/app/book/[slug]/schedule/ScheduleMenu";
import EmbedAutoResize from "../EmbedAutoResize";
import EmbedScheduleShell from "./EmbedScheduleShell";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return companyMetaBySlug(slug, "Book a time");
}

type EmbedParams = { theme?: string; transparent?: string; accent?: string; font?: string };

/** Chrome-less booking menu for <iframe> embeds. Cards link to the hosted pages. */
export default async function EmbedSchedulePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<EmbedParams> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const [listed, shell] = await Promise.all([listPublicBookingTypes(slug), resolveScheduleAppearance(slug, sp)]);
  if (!listed || !shell) notFound();
  return (
    <EmbedScheduleShell appearance={shell.appearance}>
      <EmbedAutoResize slug={`${slug}/schedule`} />
      <ScheduleMenu companySlug={slug} types={listed.types.filter((t) => t.bookable)} appearance={shell.appearance} hrefBase={`/embed/${slug}/schedule`} />
    </EmbedScheduleShell>
  );
}
