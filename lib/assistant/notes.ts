import { type Tool, str, stage } from "./core";
import { STICKY_BODY_MAX, STICKY_COLORS } from "../sticky-shared";

/**
 * Sticky notes on Home. Cheap and fun: "stick a note that the Smith job
 * needs a 40 ft ladder". Staged like every other write so the user
 * confirms the card; the note lands on their own board unless they ask
 * for the team board.
 */
export const noteTools: Tool[] = [
  {
    decl: {
      name: "add_sticky_note",
      description:
        "Stage a sticky note on the user's Home dashboard (a square paper note: a scribble, a number, a reminder to self — NOT a task; use create_task-style tools for to-dos with dates). Optional color (yellow default) and team=true to pin it to the team board everyone sees. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          body: { type: "string", description: `The note text, plain, up to ${STICKY_BODY_MAX} characters` },
          color: { type: "string", enum: STICKY_COLORS.map((c) => c.key.toLowerCase()) },
          team: { type: "boolean", description: "Pin to the team board (everyone in the company sees it)" },
        },
        required: ["body"],
      },
    },
    allowed: () => true,
    run: async (_actor, args, ctx) => {
      const body = str(args.body, STICKY_BODY_MAX);
      if (!body) return { error: "body is required" };
      const colorKey = typeof args.color === "string" ? args.color.toUpperCase() : "YELLOW";
      const color = STICKY_COLORS.some((c) => c.key === colorKey) ? colorKey : "YELLOW";
      const shared = args.team === true;
      return stage(ctx, {
        kind: "add_sticky_note",
        title: shared ? "Pin a note to the team board" : "Stick a note on Home",
        lines: [`"${body.slice(0, 120)}${body.length > 120 ? "…" : ""}"`, `${color.charAt(0) + color.slice(1).toLowerCase()} paper`],
        endpoint: "/api/app/notes",
        method: "POST",
        payload: { body, color, shared },
      });
    },
  },
];
