import { redirect } from "next/navigation";
import { getSession } from "@/lib/permissions";
import { safeAppPath } from "@/lib/push-open";
import OpenSwitch from "./OpenSwitch";

export const dynamic = "force-dynamic";

/**
 * Notification-tap landing shim: /app/open?u=<membership user id>&to=<path>.
 *
 * Push notifications can arrive from ANY company on the account (lib/push.ts
 * fans out account-wide), but the tapped deep link is scoped to the company
 * that sent it. When the tap is for the membership already signed in (or
 * names none), the server answers with a redirect straight to the page — no
 * client round trip, no spinner, one navigation. Only a tap from another
 * membership renders OpenSwitch, which switches the session and then follows
 * the link. (A running app tab never loads this page at all any more: the
 * service worker / native shell hand the tap to AppShell, lib/push-open.ts.)
 */
export default async function OpenPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string | string[]; u?: string | string[] }>;
}) {
  const params = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  // In-app paths only — this must never become an open redirect.
  const dest = safeAppPath(first(params.to));
  const target = first(params.u);

  const session = await getSession();
  if (!session?.user?.id) redirect("/app/login");
  if (!target || target === session.user.id) redirect(dest);

  return <OpenSwitch target={target} dest={dest} />;
}
