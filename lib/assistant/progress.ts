/**
 * The one line the drawer shows while a turn runs ("Looking up clients…").
 * A turn can take several tool rounds and ten-plus seconds; a static
 * "Looking that up…" reads as a hang, while naming the step reads as work.
 * Pure: tool names in, one short English line out (unit-tested in
 * scripts/test-assistant-progress.ts).
 */

const VERBS: [RegExp, string][] = [
  [/^(list|search|find|get|lookup|look_up|read|show|check|count|summarize|summarise|report)_?/, "Looking up"],
  [/^(create|add|new|stage|draft|propose|build|generate|compose|write)_?/, "Drafting"],
  [/^(update|edit|set|change|move|assign|reschedule|rename|mark|toggle|convert|reorder|adjust)_?/, "Preparing changes to"],
  [/^(send|email|text|notify|share|remind)_?/, "Preparing to send"],
  [/^(delete|remove|archive|cancel|void)_?/, "Preparing to remove"],
  [/^(optimi[sz]e|plan|route|suggest|recommend|estimate|calculate|compute|price)_?/, "Working out"],
];

const SPECIAL: Record<string, string> = {
  help_search: "Checking the Help Center…",
  queue_next_step: "Lining up the next step…",
};

/** "quote_line_items" → "quote line items" */
function subject(rest: string): string {
  return rest.replace(/_/g, " ").trim();
}

/** One tool call → "Looking up clients…" */
export function describeToolCall(name: string): string {
  if (SPECIAL[name]) return SPECIAL[name];
  for (const [re, verb] of VERBS) {
    if (re.test(name)) {
      const s = subject(name.replace(re, ""));
      return s ? `${verb} ${s}…` : `${verb}…`;
    }
  }
  const s = subject(name);
  return s ? `Working on ${s}…` : "Working on it…";
}

/**
 * A round's calls → one line. Several different tools collapse to the first
 * with a count, so a bulk round reads "Drafting jobs… (12 steps)" and not a
 * paragraph.
 */
export function describeToolCalls(names: string[]): string {
  if (names.length === 0) return "Thinking…";
  const first = describeToolCall(names[0]);
  const distinct = new Set(names).size;
  if (names.length === 1 || distinct === 1) {
    return names.length > 1 ? `${first.replace(/…$/, "")} (${names.length})…` : first;
  }
  return `${first.replace(/…$/, "")} (${names.length} steps)…`;
}
