import { ListPageSkeleton } from "@/components/ListSkeleton";

export default function QuotesLoading() {
  return <ListPageSkeleton kpis={4} filters={6} />;
}
