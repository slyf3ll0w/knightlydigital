import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import { ensureStages, listBoards, MAIN_BOARD_NAME } from "@/lib/pipeline";
import PipelineSettingsClient from "./PipelineSettingsClient";
import { DsPage } from "@/components/ds";

export const dynamic = "force-dynamic";

/** Settings → Clients & documents → Lead pipeline: customize board stages + the lead-intake webhook. */
export default async function PipelineSettingsPage({ searchParams }: { searchParams: Promise<{ board?: string | string[] }> }) {
  const actor = await requirePageActor((a) => isManager(a.role));
  const asked = (await searchParams).board;

  const [allStages, boards, forms, company] = await Promise.all([
    ensureStages(actor.companyId),
    listBoards(prisma, actor.companyId),
    prisma.bookingType.findMany({ where: { companyId: actor.companyId, leadBoardId: { not: null } }, select: { id: true, name: true, leadBoardId: true } }),
    prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { leadWebhookToken: true, hideConvertedLeads: true },
    }),
  ]);

  const base = (process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com").replace(/\/$/, "");
  // One board's columns at a time (?board=<id>; none = the main board)
  const board = boards.find((b) => b.id === (typeof asked === "string" ? asked : "")) ?? null;
  const stages = allStages.filter((s) => s.isConverted || (s.boardId ?? null) === (board?.id ?? null));
  const converted = stages.find((s) => s.isConverted);

  return (
    <DsPage open className="st-page">
      <PipelineSettingsClient
        key={board?.id ?? "main"}
        board={board ? { id: board.id, name: board.name, sources: board.sources, forms: forms.filter((f) => f.leadBoardId === board.id).map((f) => ({ id: f.id, name: f.name })) } : null}
        boards={boards.length ? [{ id: null, name: MAIN_BOARD_NAME }, ...boards.map((b) => ({ id: b.id, name: b.name }))] : []}
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
    </DsPage>
  );
}
