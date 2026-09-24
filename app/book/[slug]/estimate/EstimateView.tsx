import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { isBotUserAgent } from "@/lib/bots";
import { atlasAccess, ATLAS_ACCESS_SELECT } from "@/lib/assistant-access";
import { resolvePublicEstimator } from "@/lib/estimator-server";
import { defaultButtonLabel, publicInputs } from "@/lib/estimator-public";
import { appearanceFor, type AppearanceOverrides } from "../schedule/shell";
import ScheduleFrame from "../schedule/ScheduleFrame";
import EmbedScheduleShell from "@/app/embed/[slug]/schedule/EmbedScheduleShell";
import EmbedAutoResize from "@/app/embed/[slug]/EmbedAutoResize";
import PublicEstimateForm from "@/components/PublicEstimateForm";

export type EstimateSearchParams = AppearanceOverrides & { preview?: string; thumb?: string };

/**
 * One estimate tool as a website form, hosted (/book/[slug]/estimate/[tool])
 * or inside the /embed iframe. The visitor sees the tool's questions and,
 * per the owner's settings, an estimate — never the formulas. Themed with the
 * company's booking-page look so it sits next to the booking items as one
 * family. ?preview=1 lets a signed-in manager see an unpublished form.
 */
export default async function EstimateView({
  companySlug,
  toolSlug,
  embed = false,
  searchParams = {},
}: {
  companySlug: string;
  toolSlug: string;
  embed?: boolean;
  searchParams?: EstimateSearchParams;
}) {
  const pub = await resolvePublicEstimator(companySlug, toolSlug, { preview: searchParams.preview === "1" });
  if (!pub) notFound();
  const { company, row, spec, config, previewing } = pub;
  const appearance = appearanceFor(company, searchParams);
  // A view is a person: previews, thumbnails, crawlers and link-preview fetchers don't count
  if (!previewing && searchParams.thumb !== "1" && !isBotUserAgent((await headers()).get("user-agent"))) {
    void prisma.estimator.update({ where: { id: row.id }, data: { publicViews: { increment: 1 } } }).catch(() => {});
  }

  // Atlas fill-in only shows when the business can actually pay for it: a used-up
  // meter (no usage billing yet) or no assistant means the step simply isn't there
  let assistAvailable = false;
  if (spec.assist) {
    const meter = await prisma.company.findUnique({ where: { id: company.id }, select: ATLAS_ACCESS_SELECT });
    const level = meter ? atlasAccess(meter).level : "off";
    assistAvailable = level !== "off" && level !== "locked";
  }

  const heading = config.heading || row.name;
  const intro = config.intro || spec.intro || "";
  const previewNote = previewing && (
    <div className={`mb-4 rounded border px-3 py-2 text-center text-xs ${appearance.dark ? "border-white/15 text-gray-400" : "border-gray-200 bg-white text-gray-500"}`}>
      Preview — this is what visitors see{row.isPublic ? "" : " once it's on your website"}. Nothing submits from here.
    </div>
  );
  const form = (
    <PublicEstimateForm
      companySlug={companySlug}
      toolSlug={toolSlug}
      inputs={publicInputs(spec)}
      config={config}
      buttonLabel={defaultButtonLabel(config)}
      heading={heading}
      intro={intro}
      appearance={appearance}
      businessName={company.name}
      showHeader={embed}
      preview={previewing}
      photoAssist={config.photoAssist && Boolean(spec.assist)}
      assistAvailable={assistAvailable}
      mapCenter={typeof company.lat === "number" && typeof company.lng === "number" ? [company.lat, company.lng] : null}
    />
  );

  if (embed) {
    return (
      <EmbedScheduleShell appearance={appearance}>
        <EmbedAutoResize slug={`${companySlug}/estimate/${toolSlug}`} />
        {previewNote}
        {form}
      </EmbedScheduleShell>
    );
  }
  return (
    <ScheduleFrame company={company} appearance={appearance} title={heading} subtitle={intro || company.name}>
      {previewNote}
      {form}
    </ScheduleFrame>
  );
}
