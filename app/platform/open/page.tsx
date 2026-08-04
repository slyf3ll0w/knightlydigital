"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { clearOfflineCaches } from "@/lib/company-switch";

/**
 * Notification-tap landing shim: /app/open?u=<membership user id>&to=<path>.
 *
 * Push notifications can arrive from ANY company on the account (lib/push.ts
 * fans out account-wide), but the tapped deep link is scoped to the company
 * that sent it. This page switches the session to that membership when needed
 * — the JWT update trigger verifies the row really belongs to this account,
 * so a forged ?u= silently no-ops — then follows the link. Already on the
 * right company (or it's your only one): straight redirect.
 */
export default function OpenPage() {
  const { data: session, status, update } = useSession();
  const ran = useRef(false);

  useEffect(() => {
    if (status === "loading" || ran.current) return;
    ran.current = true;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const to = params.get("to") ?? "";
      const target = params.get("u");
      // In-app paths only — this must never become an open redirect.
      const dest = to.startsWith("/app/") ? to : "/app/dashboard";

      if (!session?.user?.id) {
        window.location.replace(`/app/login`);
        return;
      }
      if (target && target !== session.user.id) {
        try {
          await update({ switchToUserId: target });
          await clearOfflineCaches();
        } catch {
          // Switch is best effort — worst case the destination page 404s
          // inside the current company instead of stranding the tap.
        }
      }
      window.location.replace(dest);
    })();
  }, [status, session, update]);

  return (
    <div className="flex min-h-[60dvh] items-center justify-center">
      <Loader2 size={22} className="animate-spin text-gray-400" />
    </div>
  );
}
