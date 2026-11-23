import { Clock, Filter, Zap } from "lucide-react";
import type { StepKind } from "@/lib/automations";

/**
 * One automation drawn as its own little flow: the trigger, then each step
 * (wait / only-if / action) as connected nodes. It mirrors what the card
 * builder makes, so the list reads like a row of tiny diagrams instead of a
 * ledger. Horizontal on wide cards (wrapping), a vertical spine on phones
 * and in the detail sheet.
 */
export type FlowNode = { kind: "trigger" | StepKind; text: string };

/** "When a quote is sent" → "a quote is sent": the node already says it's the start. */
function nodeText(n: FlowNode): string {
  if (n.kind === "trigger") return n.text.replace(/^When\s+/i, "");
  return n.text;
}

export default function Flow({
  nodes,
  layout = "row",
  paused = false,
  max,
  className = "",
}: {
  nodes: FlowNode[];
  layout?: "row" | "column";
  paused?: boolean;
  /** Row layout: show this many nodes, then "+N more". */
  max?: number;
  className?: string;
}) {
  const shown = max && nodes.length > max ? nodes.slice(0, max) : nodes;
  const extra = nodes.length - shown.length;
  return (
    <ol className={`auto-flow is-${layout} ${paused ? "is-paused" : ""} ${className}`}>
      {shown.map((n, i) => (
        <li key={i} className={`auto-node is-${n.kind}`} style={{ ["--i" as string]: i }} title={`${n.kind === "trigger" ? "When " : ""}${nodeText(n)}`}>
          <span className="auto-node-mark" aria-hidden>
            {n.kind === "trigger" ? <Zap size={12} strokeWidth={2.6} /> : n.kind === "wait" ? <Clock size={12} strokeWidth={2.4} /> : n.kind === "filter" ? <Filter size={11} strokeWidth={2.4} /> : null}
          </span>
          <span className="auto-node-text">
            {n.kind === "trigger" && <span className="auto-node-when">When </span>}
            {nodeText(n)}
          </span>
        </li>
      ))}
      {extra > 0 && (
        <li className="auto-node is-more" style={{ ["--i" as string]: shown.length }}>
          <span className="auto-node-text">+{extra} more</span>
        </li>
      )}
    </ol>
  );
}
