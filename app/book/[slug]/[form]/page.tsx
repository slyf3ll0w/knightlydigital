import BookPageView from "../BookPageView";

export default async function BookingFormPage({
  params,
}: {
  params: Promise<{ slug: string; form: string }>;
}) {
  const { slug, form } = await params;
  return <BookPageView companySlug={slug} formSlug={form} />;
}
