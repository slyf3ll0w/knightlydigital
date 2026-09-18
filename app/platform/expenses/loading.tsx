import { ListPageSkeleton } from "@/components/ListSkeleton";

export default function ExpensesLoading() {
  return <ListPageSkeleton kpis={0} filters={2} />;
}
