import { ListPageSkeleton } from "@/components/ListSkeleton";

export default function JobsLoading() {
  return <ListPageSkeleton kpis={3} filters={4} />;
}
