import Link from "next/link";
import { notFound } from "next/navigation";
import { companyMetaBySlug } from "@/lib/client-meta";
import { resolveScheduleAppearance } from "../schedule/shell";
import ScheduleFrame from "../schedule/ScheduleFrame";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return companyMetaBySlug(slug, "About");
}

/**
 * /book/[slug]/about — the business's About + contact card on its own, the
 * "About" link in the slim footer under every form. Same facts as the full
 * footer on /book/<slug> (the website on its texting registration).
 */
export default async function BusinessAboutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shell = await resolveScheduleAppearance(slug, {}, { skipGate: true });
  if (!shell) notFound();
  const { accent } = shell.appearance;
  return (
    <ScheduleFrame company={shell.company} appearance={shell.appearance} footer="full">
      <div className="text-center">
        <Link
          href={`/book/${slug}`}
          className="inline-block rounded-lg px-5 py-2.5 text-sm font-semibold text-white"
          style={{ backgroundColor: accent }}
        >
          Book online
        </Link>
      </div>
    </ScheduleFrame>
  );
}
