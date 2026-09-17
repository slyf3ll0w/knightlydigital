"use client";

import { ChevronRight } from "lucide-react";
import { AtlasMark } from "@/components/AtlasIcon";
import { useAssistant } from "@/components/AssistantContext";
import { hapticImpact } from "@/lib/haptics";

/**
 * Atlas's seat on the phone home — the same headline row he has in the
 * More sheet, so the two read as one thing. Phones only (desktop has the
 * floating bubble); renders nothing when Atlas is unavailable.
 */
export default function AtlasHomeButton({ className = "" }: { className?: string }) {
  const atlas = useAssistant();
  if (!atlas.available) return null;
  return (
    <button
      type="button"
      onClick={() => {
        hapticImpact("LIGHT");
        atlas.open();
      }}
      className={`card-tool flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-gray-50 lg:hidden ${className}`}
    >
      <AtlasMark size={36} accent={atlas.accent} className="shrink-0 rounded-[10px]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-gray-900">
          Ask {atlas.name}
        </span>
        <span className="block truncate text-xs text-gray-500">
          {atlas.locked
            ? "Out of tokens until the meter refills"
            : "Ask anything — or hand off a task"}
        </span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-gray-300" />
    </button>
  );
}
