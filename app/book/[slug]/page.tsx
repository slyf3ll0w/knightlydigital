import { notFound } from "next/navigation";
import { companyMetaBySlug } from "@/lib/client-meta";
import { loadBookingPage, loadBookingItem } from "@/lib/booking-public";
import ScheduleFrame from "./schedule/ScheduleFrame";
import ScheduleMenu from "./schedule/ScheduleMenu";
import ItemView, { type ItemSearchParams } from "./ItemView";
import EstimateMenu from "./estimate/EstimateMenu";
import { publicEstimatorsFor } from "@/lib/estimator-server";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return companyMetaBySlug(slug, "Book online");
}

/**
 * /book/[slug] — the company's booking page. One item on it → that item
 * renders directly (what the default form used to be); several → a menu.
 */
export default async function BookingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<ItemSearchParams> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const preview = sp.preview === "1";
  const page = await loadBookingPage(slug, { preview });
  if (!page) notFound();
  // Published estimate forms sit under the booking items (lib/estimator-public.ts)
  const estimateTools = await publicEstimatorsFor(page.company.id);
  if (page.menu.length === 1 && estimateTools.length === 0) {
    const item = await loadBookingItem(slug, page.menu[0].slug, { preview });
    if (item) return <ItemView companySlug={slug} itemSlug={item.pub.slug} searchParams={sp} loaded={item} />;
  }
  const { company, appearance } = page;
  return (
    <ScheduleFrame company={company} appearance={appearance} title={appearance.title || undefined} subtitle={appearance.description || "Pick what you'd like to book"}>
      {page.previewing && sp.thumb !== "1" && (
        <div className={`mb-4 rounded border px-3 py-2 text-center text-xs ${appearance.dark ? "border-white/15 text-gray-400" : "border-gray-200 bg-white text-gray-500"}`}>
          Preview — this is your booking page as customers see it.
        </div>
      )}
      {(page.menu.length > 0 || estimateTools.length === 0) && <ScheduleMenu companySlug={slug} types={page.menu} appearance={appearance} />}
      {estimateTools.length > 0 && (
        <div className={page.menu.length > 0 ? "mt-6" : ""}>
          {page.menu.length > 0 && <p className={`mb-2 text-xs font-semibold uppercase tracking-wide ${appearance.dark ? "text-gray-500" : "text-gray-400"}`}>Instant estimates</p>}
          <EstimateMenu companySlug={slug} tools={estimateTools} appearance={appearance} />
        </div>
      )}
    </ScheduleFrame>
  );
}
