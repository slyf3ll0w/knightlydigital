import BookPageView from "./BookPageView";

export default async function BookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <BookPageView companySlug={slug} />;
}
