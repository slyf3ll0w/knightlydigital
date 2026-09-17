import { loadBoard, syncCatalog } from "@/lib/packaging-board";
import PackagingClient from "./PackagingClient";

export const dynamic = "force-dynamic";

/**
 * The packaging board: where the free/paid split gets decided by dragging
 * feature cards into tiers. Opening the page seeds the starter columns and
 * pulls in any feature that shipped since the last visit, so the board is
 * never quietly out of date with what WorkBench actually does.
 */
export default async function PackagingPage() {
  await syncCatalog();
  const lanes = await loadBoard();
  return <PackagingClient initialLanes={lanes} />;
}
