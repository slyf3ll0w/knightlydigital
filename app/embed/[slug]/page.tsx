import { notFound } from "next/navigation";
import { companyMetaBySlug } from "@/lib/client-meta";
import { loadBookingPage, loadBookingItem } from "@/lib/booking-public";
import ItemView, { type ItemSearchParams } from "@/app/book/[slug]/ItemView";
import ScheduleMenu from "@/app/book/[slug]/schedule/ScheduleMenu";
import EmbedAutoResize from "./EmbedAutoResize";
import EmbedScheduleShell from "./schedule/EmbedScheduleShell";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return companyMetaBySlug(slug);
}

/**
 * /embed/[slug] — the booking page inside an <iframe>. One item → that
 * item (what the default form's embed used to be); several → the menu, whose
 * rows navigate inside the frame. Query params override the saved look per
 * placement (?theme/?transparent/?accent/?font); ?service pre-fills.
 */
export default async function EmbedBookingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<ItemSearchParams> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const page = await loadBookingPage(slug, { overrides: sp });
  if (!page) notFound();
  if (page.menu.length === 1) {
    const item = await loadBookingItem(slug, page.menu[0].slug, { overrides: sp });
    if (item) {
      return (
        <>
          {/* legacy resize key: the default form's snippet listens for the bare company slug */}
          <EmbedAutoResize slug={slug} />
          <ItemView companySlug={slug} itemSlug={item.pub.slug} searchParams={sp} loaded={item} embed />
        </>
      );
    }
  }
  return (
    <EmbedScheduleShell appearance={page.appearance}>
      <EmbedAutoResize slug={slug} />
      <ScheduleMenu companySlug={slug} types={page.menu} appearance={page.appearance} hrefBase={`/embed/${slug}`} />
    </EmbedScheduleShell>
  );
}
