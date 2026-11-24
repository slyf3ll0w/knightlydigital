import { redirect } from "next/navigation";
import { ESTIMATOR_LIBRARY_ENABLED } from "@/lib/estimator-library-flag";

/**
 * /app/estimates/library — the Library is now a view of the Estimates page
 * (Tools | Library, like Agreements | Templates). Old links land there.
 */
export default function LibraryPage() {
  redirect(ESTIMATOR_LIBRARY_ENABLED ? "/app/estimates?view=library" : "/app/estimates");
}
