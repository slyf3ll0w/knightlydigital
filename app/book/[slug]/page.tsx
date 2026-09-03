import { notFound } from "next/navigation";
import { companyMetaBySlug } from "@/lib/client-meta";
import { loadBookingPage, loadBookingItem } from "@/lib/booking-public";
import ScheduleFrame from "./schedule/ScheduleFrame";
import ScheduleMenu from "./schedule/ScheduleMenu";
import ItemView, { type ItemSearchParams } from "./ItemView";

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
  if (page.menu.length === 1) {
    const item = await loadBookingItem(slug, page.menu[0].slug, { preview });
    if (item) return <ItemView companySlug={slug} itemSlug={item.pub.slug} searchParams={sp} loaded={item} />;
  }
  const { company, appearance } = page;
  return (
    <ScheduleFrame company={company} appearance={appearance} title={appearance.title || undefined} subtitle={appearance.description || "Pick what you'd like to book"}>
      {page.previewing && (
        <div className={`mb-4 rounded border px-3 py-2 text-center text-xs ${appearance.dark ? "border-white/15 text-gray-400" : "border-gray-200 bg-white text-gray-500"}`}>
          Preview — this is your booking page as customers see it.
        </div>
      )}
      <ScheduleMenu companySlug={slug} types={page.menu} appearance={appearance} />
    </ScheduleFrame>
  );
}
