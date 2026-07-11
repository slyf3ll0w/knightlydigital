import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import { ensureStages } from "@/lib/pipeline";
import PipelineSettingsClient from "./PipelineSettingsClient";

export const dynamic = "force-dynamic";

/** Settings → Lead Pipeline: customize board stages + the lead-intake webhook. */
export default async function PipelineSettingsPage() {
  const actor = await requirePageActor((a) => isManager(a.role));

  const [stages, company] = await Promise.all([
    ensureStages(actor.companyId),
    prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { leadWebhookToken: true, hideConvertedLeads: true },
    }),
  ]);

  const base = (process.env.NEXTAUTH_URL ?? "https://streamflaire.com").replace(/\/$/, "");
  const converted = stages.find((s) => s.isConverted);

  return (
    <PipelineSettingsClient
      initialStages={stages
        .filter((s) => !s.isConverted)
        .map((s) => ({
          id: s.id,
          name: s.name,
          color: s.color,
          autoAdvanceOn: s.autoAdvanceOn,
        }))}
      convertedStage={
        converted ? { id: converted.id, name: converted.name, color: converted.color } : null
      }
      hideConverted={company?.hideConvertedLeads ?? false}
      webhookUrl={
        company?.leadWebhookToken ? `${base}/api/public/leads/${company.leadWebhookToken}` : null
      }
    />
  );
}
