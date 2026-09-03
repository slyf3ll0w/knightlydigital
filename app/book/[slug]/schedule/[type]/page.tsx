import { permanentRedirect } from "next/navigation";

/** /book/[slug]/schedule/[type] was the v2 item page — items live at /book/[slug]/[item] now. */
export default async function ScheduleTypePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; type: string }>;
  searchParams: Promise<{ prefill?: string }>;
}) {
  const { slug, type } = await params;
  const { prefill } = await searchParams;
  permanentRedirect(`/book/${slug}/${type}${prefill ? `?prefill=${encodeURIComponent(prefill)}` : ""}`);
}
