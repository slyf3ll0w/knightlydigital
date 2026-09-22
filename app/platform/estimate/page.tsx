import { redirect } from "next/navigation";

/** The onsite runner is the Estimates page with the runner open. */
export default function EstimateRedirect() {
  redirect("/app/estimates?run=1");
}
