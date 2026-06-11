import { ListPageSkeleton } from "@/components/ListSkeleton";

export default function InvoicesLoading() {
  return <ListPageSkeleton kpis={3} filters={5} />;
}
