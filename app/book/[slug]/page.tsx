import BookPageView from "./BookPageView";
import { companyMetaBySlug } from "@/lib/client-meta";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return companyMetaBySlug(slug, "Book a Service");
}

export default async function BookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <BookPageView companySlug={slug} />;
}
