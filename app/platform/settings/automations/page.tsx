import { redirect } from "next/navigation";

/** Automations moved to their own page (2026-09-24); old links keep working. */
export default function LegacyAutomationsPage() {
  redirect("/app/automations");
}
