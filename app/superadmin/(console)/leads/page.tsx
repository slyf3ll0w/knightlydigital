import { requireSuperadminPage } from "@/lib/superadmin";
import { loadConsoleBoard } from "@/lib/console-leads";
import ConsoleLeadsBoard from "@/components/console/ConsoleLeadsBoard";

export const dynamic = "force-dynamic";

/**
 * WorkBench's own lead board: people who might become accounts, from the
 * website's Contact us form and manual adds. The same kanban as a tenant's
 * Leads page (drag between columns, Won / Lost zones, editable columns).
 */
export default async function ConsoleLeadsPage() {
  await requireSuperadminPage();
  const { stages, cards, lost } = await loadConsoleBoard();
  return <ConsoleLeadsBoard stages={stages} cards={cards} lost={lost} />;
}
