"use client";

import { Mic } from "lucide-react";
import { AtlasMark } from "@/components/AtlasIcon";
import { useAssistant } from "@/components/AssistantContext";

/**
 * Home's front door to the voice conversation (David 2026-10-23: "most
 * people will prefer this over the chat"). One tap → the talk screen, mic
 * already asked for. Renders nothing when Atlas is off for the company.
 */
export default function TalkToAtlas({ className = "" }: { className?: string }) {
  const atlas = useAssistant();
  if (!atlas.available) return null;
  return (
    <button
      type="button"
      onClick={atlas.talk}
      className={`ds-rise flex w-full items-center gap-3 rounded-2xl border border-[color:var(--ds-line)] bg-[color:var(--ds-surface)] px-3.5 py-3 text-left shadow-sm transition-colors active:brightness-95 ${className}`}
      aria-label={`Talk to ${atlas.name}`}
    >
      <AtlasMark size={40} accent={atlas.accent} className="shrink-0 rounded-[12px]" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-[color:var(--ds-ink)]">Talk to {atlas.name}</span>
        <span className="block truncate text-[12.5px] text-[color:var(--ds-ink-2)]">
          {atlas.locked ? "Out of tokens for now — back when the meter refills." : "Say what you need — schedule, quotes, clients, follow-ups. Hands-free."}
        </span>
      </span>
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        style={{ background: "var(--wb-accent, var(--ds-primary))", color: "var(--wb-on-accent, #ffffff)" }}
      >
        <Mic size={18} />
      </span>
    </button>
  );
}
