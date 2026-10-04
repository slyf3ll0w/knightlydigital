"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { clearOfflineCaches } from "@/lib/company-switch";

/**
 * The company-switch half of the notification-tap landing page: the tapped
 * push came from a DIFFERENT membership on this account than the one signed
 * in. Switch the session to it — the JWT update trigger verifies the row
 * really belongs to this account, so a forged ?u= silently no-ops — then
 * follow the link. (Same-membership taps never get here: page.tsx redirects
 * them on the server.)
 */
export default function OpenSwitch({ target, dest }: { target: string; dest: string }) {
  const { status, update } = useSession();
  const ran = useRef(false);

  useEffect(() => {
    if (status === "loading" || ran.current) return;
    ran.current = true;
    (async () => {
      if (status !== "authenticated") {
        window.location.replace("/app/login");
        return;
      }
      try {
        await update({ switchToUserId: target });
        await clearOfflineCaches();
      } catch {
        // Switch is best effort — worst case the destination page 404s
        // inside the current company instead of stranding the tap.
      }
      window.location.replace(dest);
    })();
  }, [status, update, target, dest]);

  return (
    <div className="flex min-h-[60dvh] items-center justify-center">
      <Loader2 size={22} className="animate-spin text-gray-400" />
    </div>
  );
}
