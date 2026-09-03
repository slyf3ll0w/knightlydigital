import { permanentRedirect } from "next/navigation";

/** /embed/[slug]/schedule was the v2 embedded menu — it's /embed/[slug] now. */
export default async function EmbedSchedulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  permanentRedirect(`/embed/${slug}`);
}
