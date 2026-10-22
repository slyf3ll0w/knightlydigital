import { type Tool, str, stage } from "./core";

/**
 * The honest fallback. When a user asks for something no tool covers, the
 * worst answer is a flat "I can't do that" — the second worst is pretending.
 * This tool turns the gap into a feedback ticket (the same SUGGESTION ticket
 * the Help menu's "Send feedback" files; it lands in the superadmin console
 * next to every other request), so every unmet ask becomes a to-do for the
 * WorkBench team instead of evaporating in a chat. The user still presses
 * Confirm — nothing is sent behind their back.
 */
export const gapTools: Tool[] = [
  {
    decl: {
      name: "request_ability",
      description:
        "LAST RESORT, only after you have genuinely checked every tool (query_records, report, the manage_* and update_* tools, help_search) and found nothing that can do what the user asked. Stages a card that sends the request to the WorkBench team as a feature request, quoting what the user wanted in their words. Call it in the SAME reply where you explain the closest thing you can do right now. Never call it for things you can do, and never instead of trying.",
      parameters: {
        type: "object",
        properties: {
          request: { type: "string", description: "What the user asked for, in one or two plain sentences, in their words where possible" },
          workaround: { type: "string", description: "The closest thing WorkBench can do today (what you offered), or 'none'" },
        },
        required: ["request"],
      },
    },
    allowed: () => true,
    run: async (actor, args, ctx) => {
      const request = str(args.request, 600);
      if (!request) return { error: "request is required" };
      const workaround = str(args.workaround, 400);
      const title = `Atlas couldn't: ${request.length > 120 ? `${request.slice(0, 117)}…` : request}`;
      const details = [
        `Asked of Atlas by ${actor.name} (${actor.role.toLowerCase()}):`,
        request,
        "",
        `What Atlas offered instead: ${workaround || "nothing — no tool covers this"}`,
      ].join("\n");
      return stage(ctx, {
        kind: "request_ability",
        title: "Send this request to the WorkBench team",
        lines: [request.length > 200 ? `${request.slice(0, 200)}…` : request],
        endpoint: "/api/app/feedback",
        method: "POST",
        payload: { type: "SUGGESTION", title, details, pageUrl: "/app (Atlas)" },
        confirmLabel: "Send request",
      });
    },
  },
];
