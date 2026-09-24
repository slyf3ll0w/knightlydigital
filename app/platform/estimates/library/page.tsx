import { redirect } from "next/navigation";

/**
 * /app/estimates/library — the Library is now a view of the Estimates page
 * (Tools | Library, like Agreements | Templates). Old links land there.
 */
export default function LibraryPage() {
  redirect("/app/estimates?view=library");
}
