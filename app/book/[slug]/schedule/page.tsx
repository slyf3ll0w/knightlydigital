import { permanentRedirect } from "next/navigation";

/** /book/[slug]/schedule was the v2 booking menu — the booking page is /book/[slug] now. */
export default async function SchedulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  permanentRedirect(`/book/${slug}`);
}
