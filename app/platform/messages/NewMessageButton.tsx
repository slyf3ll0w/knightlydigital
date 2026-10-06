"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";
import ReachPicker from "@/components/ReachPicker";
import { hapticImpact } from "@/lib/haptics";

/**
 * "New message" on the inbox: pick a client (or a business contact) and land
 * in their conversation — the existing thread if there is one, an empty one
 * otherwise (the thread page works for a contact with no messages yet, so
 * "new" and "existing" are the same route). The picker itself is
 * components/ReachPicker.tsx, shared with the phone Create sheet.
 *
 * Desktop gets a glass modal with a search field; phones get a bottom sheet.
 */
export default function NewMessageButton({
  compact = false,
  hasLine = false,
}: {
  compact?: boolean;
  /** The company has a business line — a typed-in number can start a thread (texts go from that line). */
  hasLine?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(false); // which surface: sheet (phone) or modal (desktop)
  // An old ?new=1 link (bookmarks, the pre-2026-10-06 Create tile): open the
  // picker at once and drop the flag, so a refresh or Back doesn't reopen it.
  const params = useSearchParams();
  const wantsNew = params.get("new") === "1";
  useEffect(() => {
    if (!wantsNew) return;
    openPicker();
    window.history.replaceState(window.history.state, "", "/app/messages");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsNew]);

  function openPicker() {
    const onPhone = window.innerWidth < 1024;
    setPhone(onPhone);
    if (onPhone) hapticImpact("LIGHT");
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        aria-label="New message"
        title="New message"
        className={compact ? "flex h-10 w-10 items-center justify-center rounded-[10px] btn-tool-line bg-white text-gray-700 hover:bg-gray-50 transition-colors sm:w-auto sm:px-4 sm:gap-1.5 text-sm font-semibold" : "btn-primary h-10"}
      >
        <MessageSquarePlus size={15} />
        <span className={compact ? "hidden sm:inline" : ""}>New message</span>
      </button>
      <ReachPicker open={open} onClose={() => setOpen(false)} mode="message" sheet={phone} hasLine={hasLine} />
    </>
  );
}
