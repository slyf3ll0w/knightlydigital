import { permanentRedirect } from "next/navigation";

/** /embed/[slug]/schedule/[type] was the v2 embedded item — it's /embed/[slug]/[item] now. */
export default async function EmbedScheduleTypePage({ params }: { params: Promise<{ slug: string; type: string }> }) {
  const { slug, type } = await params;
  permanentRedirect(`/embed/${slug}/${type}`);
}
