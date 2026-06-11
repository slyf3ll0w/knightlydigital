import { ListPageSkeleton } from "@/components/ListSkeleton";

export default function ContactsLoading() {
  return <ListPageSkeleton kpis={0} filters={4} rows={10} />;
}
