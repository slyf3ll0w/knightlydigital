import { permanentRedirect } from "next/navigation";

/** The v2 editor path — items are edited at /app/settings/booking/[id] now. */
export default async function LegacyTypeEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  permanentRedirect(`/app/settings/booking/${id}`);
}
