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
        "Stage a sticky note (a square paper note: a scribble, a number, a reminder to self — NOT a task). It sticks to Home unless `page` names another in-app page path (e.g. /app/jobs/<id>). Optional color (yellow default), team=true so everyone sees it, and expiry (today / tomorrow / week). Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          body: { type: "string", description: `The note text, plain, up to ${STICKY_BODY_MAX} characters` },
          color: { type: "string", enum: STICKY_COLORS.map((c) => c.key.toLowerCase()) },
          team: { type: "boolean", description: "Show it to the whole team" },
          page: { type: "string", description: "In-app page path to stick it to, e.g. /app/jobs/<jobId>; default /app/dashboard" },
          expiry: { type: "string", enum: ["today", "tomorrow", "week"], description: "When it comes down by itself (end of that day); omit to keep" },
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
      const page = typeof args.page === "string" && /^\/app\/[A-Za-z0-9/_-]+$/.test(args.page) ? args.page.slice(0, 200) : "/app/dashboard";
      const expiry = args.expiry === "today" || args.expiry === "tomorrow" || args.expiry === "week" ? args.expiry : undefined;
      return stage(ctx, {
        kind: "add_sticky_note",
        title: shared ? `Stick a team note on ${page === "/app/dashboard" ? "Home" : page}` : `Stick a note on ${page === "/app/dashboard" ? "Home" : page}`,
        lines: [
          `"${body.slice(0, 120)}${body.length > 120 ? "…" : ""}"`,
          `${color.charAt(0) + color.slice(1).toLowerCase()} paper${expiry ? ` · comes down ${expiry === "week" ? "in a week" : expiry}` : ""}`,
        ],
        endpoint: "/api/app/notes",
        method: "POST",
        payload: { body, color, shared, page, ...(expiry ? { expiry } : {}) },
      });
    },
  },
];
