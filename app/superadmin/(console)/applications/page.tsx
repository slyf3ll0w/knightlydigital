import { redirect } from "next/navigation";

/** Applications and invite codes became one Sign-ups page (2026-09-30). */
export default function ApplicationsMoved() {
  redirect("/superadmin/signups");
}
