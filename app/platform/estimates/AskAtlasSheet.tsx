"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import Modal from "@/components/Modal";
import { useAssistant } from "@/components/AssistantContext";
import BuildPanel, { type BuiltTool } from "./BuildPanel";

/**
 * "Ask Atlas" on a tool card: describe the change in a sentence, watch it
 * happen, done. The previous version is kept (History in the editor).
 */
export default function AskAtlasSheet({ tool, open, onClose, onChanged }: { tool: { id: string; name: string } | null; open: boolean; onClose: () => void; onChanged: (tool: BuiltTool) => void }) {
  const atlas = useAssistant();
  const [session, setSession] = useState(0);
  return (
    <Modal
      open={open}
      onClose={() => {
        setSession((s) => s + 1);
        onClose();
      }}
      cardClassName="card-ledger w-full max-w-lg p-5 max-h-[88vh] overflow-y-auto"
    >
      {tool && (
        <>
          <div className="mb-3 flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-gray-900 text-white">
              <Sparkles size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-gray-900">Change “{tool.name}”</h2>
              <p className="text-xs text-gray-500">Tell {atlas.name} what should be different. The current version is kept, so you can always go back.</p>
            </div>
          </div>
          <BuildPanel
            key={`${tool.id}-${session}`}
            compact
            autoFocus
            estimatorId={tool.id}
            placeholder="e.g. Raise sealant to $0.50, add a gate option at $250, and ask for the number of stories"
            onBuilt={(t) => onChanged(t)}
          />
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={onClose} className="h-9 rounded-lg px-3 text-sm font-medium text-gray-600 hover:bg-gray-100">
              Close
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
