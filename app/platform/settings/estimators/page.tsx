import { redirect } from "next/navigation";

/** Estimate tools moved out of Settings — they live at /app/estimates now. */
export default function EstimatorsSettingsRedirect() {
  redirect("/app/estimates");
}
