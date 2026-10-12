import { DetailPageSkeleton } from "@/components/ListSkeleton";

// A record page is loading: show its shape, not the list skeleton of the
// section above it (which used to flash here first).
export default function AppointmentsDetailLoading() {
  return <DetailPageSkeleton />;
}
