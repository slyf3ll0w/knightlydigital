import { ListPageSkeleton } from "@/components/ListSkeleton";

/** Route-level skeleton so a console navigation shows a page shape, not a blank. */
export default function ConsoleLoading() {
  return <ListPageSkeleton kpis={4} filters={4} rows={8} />;
}
