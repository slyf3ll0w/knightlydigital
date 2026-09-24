import { notFound } from "next/navigation";
import { resolveScheduleAppearance } from "./schedule/shell";
import ScheduleFrame from "./schedule/ScheduleFrame";
import { loadBusinessProfile, type BusinessProfile } from "@/lib/business-profile";

export type LegalSection = { heading: string; body: React.ReactNode[] };

/** When the wording of /book/<slug>/privacy and /book/<slug>/sms-terms last changed. */
export const BUSINESS_LEGAL_UPDATED = "September 24, 2026";

/**
 * Shell for the business's own legal pages. They are written in the
 * business's name (not WorkBench's) because carriers require the privacy
 * policy and texting terms on a campaign to belong to its brand.
 */
export default async function LegalPage({
  slug,
  title,
  sections,
}: {
  slug: string;
  title: string;
  sections: (p: BusinessProfile) => LegalSection[];
}) {
  const [shell, profile] = await Promise.all([resolveScheduleAppearance(slug, {}, { skipGate: true }), loadBusinessProfile(slug)]);
  if (!shell || !profile) notFound();
  const { dark } = shell.appearance;
  return (
    <ScheduleFrame company={shell.company} appearance={shell.appearance} title={title} subtitle={`${profile.name} · Last updated ${BUSINESS_LEGAL_UPDATED}`} wide>
      <article className={`rounded-lg border p-5 text-[14px] leading-relaxed sm:p-7 ${dark ? "border-white/10 bg-white/5 text-gray-300" : "border-gray-200 bg-white text-gray-600"}`}>
        {sections(profile).map((s) => (
          <section key={s.heading} className="mb-6 last:mb-0">
            <h2 className={`mb-2 text-base font-semibold ${dark ? "text-white" : "text-gray-900"}`}>{s.heading}</h2>
            {s.body.map((b, i) => (
              <p key={i} className="mb-2 last:mb-0">
                {b}
              </p>
            ))}
          </section>
        ))}
      </article>
    </ScheduleFrame>
  );
}
