import { prisma } from "../db";
import { canSell, isManager, jobScope } from "../permissions";
import { listChannels, resolveChannel, MESSAGE_SELECT, serializeMessage } from "../chat";
import { listNotes } from "../sticky-notes";
import { INDUSTRIES } from "../pricebooks";
import { LISTING_SELECT, LISTING_STATUS, listingCard, listingMarks } from "../estimator-library";
import { type Tool, str, num, companyTz, fmtWhen, stage } from "./core";
import { quoted } from "./untrusted";

/**
 * The 2026-10-22 gap sweep: read-only doors onto things Atlas could not see
 * (job photos, team chat, the estimate Library) and management of sticky
 * notes beyond "add one". Every write goes through the page's own route.
 */
export const extraTools: Tool[] = [
  // ── job photos ────────────────────────────────────────────────────────────
  {
    decl: {
      name: "list_job_photos",
      description:
        "The photos on a job (estimate / before / during / after / general) with captions and links the user can open. Use for 'show me the before photos from the Smith job', 'did anyone take pictures', 'how many photos are on job 1042'. Uploading photos stays on the job page.",
      parameters: {
        type: "object",
        properties: {
          jobId: { type: "string", description: "job id or number (get_document / query_records)" },
          type: { type: "string", enum: ["ESTIMATE", "BEFORE", "DURING", "AFTER", "GENERAL", "ALL"] },
        },
        required: ["jobId"],
      },
    },
    allowed: () => true,
    run: async (actor, args) => {
      const ref = str(args.jobId, 40);
      const job = await prisma.job.findFirst({
        where: {
          companyId: actor.companyId,
          ...jobScope(actor),
          ...(/^\d+$/.test(ref) ? { jobNumber: Number(ref) } : { id: ref }),
        },
        select: { id: true, jobNumber: true, title: true, contact: { select: { firstName: true, lastName: true } } },
      });
      if (!job) return { error: "No job with that id or number (or not visible to this user)." };
      const type = str(args.type, 8);
      const tz = await companyTz(actor.companyId);
      const photos = await prisma.jobPhoto.findMany({
        where: { jobId: job.id, ...(type && type !== "ALL" ? { type: type as never } : {}) },
        orderBy: { createdAt: "asc" },
        select: { id: true, type: true, caption: true, createdAt: true, siteUse: true },
      });
      return {
        job: `#${job.jobNumber} ${job.title ?? ""}`.trim(),
        client: `${job.contact.firstName} ${job.contact.lastName}`.trim(),
        count: photos.length,
        photos: photos.map((p) => ({
          id: p.id,
          type: p.type.toLowerCase(),
          ...(p.caption ? { caption: quoted(p.caption, 200) } : {}),
          taken: fmtWhen(tz, p.createdAt, false),
          link: `/api/job-photos/${p.id}`,
          ...(p.siteUse ? { onWebsite: true } : {}),
        })),
        jobPage: `/app/jobs/${job.id}`,
        note: photos.length === 0 ? "No photos yet — they're added from the job page (camera or upload)." : "Links open the full-size photo for anyone signed in.",
      };
    },
  },

  // ── team chat (read) ──────────────────────────────────────────────────────
  {
    decl: {
      name: "read_team_chat",
      description:
        "Read the team chat: without channel, lists every chat the user is in (Everyone, direct messages, groups) with unread counts and the last line; with channel (an id from that list, or 'everyone'), returns the latest messages in it. Use for 'what did I miss in chat', 'did Mike reply', 'what did the crew say about the Smith job'. Reply with post_team_message.",
      parameters: {
        type: "object",
        properties: {
          channel: { type: "string", description: "channel id from the list, or 'everyone'" },
          limit: { type: "integer", description: "messages to return, 1–60 (default 30)" },
        },
      },
    },
    allowed: () => true,
    run: async (actor, args) => {
      const tz = await companyTz(actor.companyId);
      const channelId = str(args.channel, 40);
      if (!channelId) {
        const channels = await listChannels(actor);
        return {
          channels: channels.map((c) => ({
            id: c.id,
            kind: c.kind,
            name: c.name,
            members: c.memberCount,
            unread: c.unread,
            ...(c.lastMessage
              ? { last: `${c.lastMessage.userName}: ${c.lastMessage.deleted ? "(deleted)" : c.lastMessage.body.slice(0, 120)}`, lastAt: c.lastMessage.at }
              : {}),
          })),
        };
      }
      const channel = await resolveChannel(actor, channelId);
      if (!channel) return { error: "That chat isn't available to this user — call read_team_chat without channel for the list." };
      const limit = Math.min(60, Math.max(1, Math.round(num(args.limit) ?? 30)));
      const rows = await prisma.teamMessage.findMany({
        where: { channelId: channel.id },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: MESSAGE_SELECT,
      });
      return {
        channelId: channel.id,
        messages: rows
          .reverse()
          .map(serializeMessage)
          .map((m) => ({
            from: m.userName,
            at: fmtWhen(tz, new Date(m.createdAt), false),
            text: m.deletedAt ? "(deleted)" : quoted(m.body, 500),
            ...(m.media.length > 0 ? { photos: m.media.length } : {}),
            ...(m.reactions.length > 0 ? { reactions: m.reactions.map((r) => r.emoji).join(" ") } : {}),
          })),
      };
    },
  },

  // ── sticky notes ──────────────────────────────────────────────────────────
  {
    decl: {
      name: "manage_sticky_notes",
      description:
        "Sticky notes on app pages (the yellow notes). action 'list' = the notes on a page (page = '/app/dashboard', '/app/jobs/<id>', '/app/schedule'…; default the dashboard) that this user can see — their own and team notes. 'update' edits one (noteId from list): body, color YELLOW/PINK/BLUE/GREEN/ORANGE, shared (team note), expiry none/today/tomorrow/week or expiryDate YYYY-MM-DD. 'delete' removes one. Adding a new note is add_sticky_note.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list", "update", "delete"] },
          page: { type: "string" },
          noteId: { type: "string" },
          body: { type: "string" },
          color: { type: "string", enum: ["YELLOW", "PINK", "BLUE", "GREEN", "ORANGE"] },
          shared: { type: "boolean" },
          expiry: { type: "string", enum: ["none", "today", "tomorrow", "week"] },
          expiryDate: { type: "string", description: "YYYY-MM-DD (custom expiry)" },
        },
        required: ["action"],
      },
    },
    allowed: () => true,
    run: async (actor, args, ctx) => {
      const action = str(args.action, 8);
      const tz = await companyTz(actor.companyId);
      if (action === "list") {
        const page = str(args.page, 200) || "/app/dashboard";
        const notes = await listNotes(actor, page, tz);
        return {
          page,
          count: notes.length,
          notes: notes.map((n) => ({
            id: n.id,
            body: n.body.length > 300 ? `${n.body.slice(0, 300)}…` : n.body,
            color: n.color,
            ...(n.shared ? { team: true } : {}),
            by: n.authorName,
            ...(n.expiryLabel ? { expires: n.expiryLabel } : {}),
            canEdit: n.canEdit,
          })),
        };
      }
      const noteId = str(args.noteId, 40);
      if (!noteId) return { error: "noteId is required — list first." };
      const note = await prisma.stickyNote.findFirst({
        where: { id: noteId, companyId: actor.companyId, archivedAt: null },
        select: { id: true, body: true, shared: true, userId: true },
      });
      if (!note) return { error: "No note with that id." };
      const mine = note.userId === actor.id;
      if (!mine && !(note.shared && isManager(actor.role))) {
        return { error: "Only the author can change that note (managers can change team notes)." };
      }
      const label = note.body.length > 40 ? `${note.body.slice(0, 40)}…` : note.body;
      if (action === "delete") {
        return stage(ctx, {
          kind: "delete_sticky_note",
          title: `Remove note: "${label}"`,
          lines: [],
          endpoint: `/api/app/notes/${note.id}`,
          method: "DELETE",
          payload: {},
          danger: true,
          confirmLabel: "Remove note",
        });
      }
      if (action === "update") {
        const payload: Record<string, unknown> = {};
        const lines: string[] = [];
        const body = str(args.body, 2000);
        if (body) {
          payload.body = body;
          lines.push(`Text: ${body.slice(0, 160)}`);
        }
        const color = str(args.color, 8);
        if (color) {
          payload.color = color;
          lines.push(`Color: ${color.toLowerCase()}`);
        }
        if (typeof args.shared === "boolean") {
          payload.shared = args.shared;
          lines.push(args.shared ? "Visible to the whole team" : "Just for you");
        }
        const expiry = str(args.expiry, 10);
        const expiryDate = str(args.expiryDate, 10);
        if (expiryDate) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) return { error: "expiryDate must be YYYY-MM-DD" };
          payload.expiry = "custom";
          payload.expiryDate = expiryDate;
          lines.push(`Keeps until ${expiryDate}`);
        } else if (expiry) {
          payload.expiry = expiry;
          lines.push(expiry === "none" ? "Keeps until removed" : `Expires: ${expiry}`);
        }
        if (lines.length === 0) return { error: "Nothing to change." };
        return stage(ctx, {
          kind: "update_sticky_note",
          title: `Update note: "${label}"`,
          lines,
          endpoint: `/api/app/notes/${note.id}`,
          method: "PATCH",
          payload,
          confirmLabel: "Save note",
        });
      }
      return { error: "action must be list, update, or delete" };
    },
  },

  // ── estimate Library ──────────────────────────────────────────────────────
  {
    decl: {
      name: "browse_library",
      description:
        "The estimate-tool Library: pricing calculators other WorkBench businesses shared (by trade). action 'search' lists tools (q = words, industry = one of the trades, sort likes/new) with id, name, what it prices, likes and whether this account already added it. 'add' (managers) copies one into this account's Estimate tools, ready to run or edit — a confirmation card. Use when a manager wants a calculator and building one from scratch isn't necessary ('is there a driveway pressure-washing tool I can use?').",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["search", "add"] },
          q: { type: "string" },
          industry: { type: "string", description: `one of: ${INDUSTRIES.join(", ")}` },
          sort: { type: "string", enum: ["likes", "new"] },
          listingId: { type: "string", description: "add: the id from search" },
        },
        required: ["action"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const action = str(args.action, 8);
      if (action === "search") {
        const q = str(args.q, 80);
        const industry = str(args.industry, 60);
        const sort = str(args.sort, 6) === "new" ? "new" : "likes";
        const rows = await prisma.estimatorListing.findMany({
          where: {
            status: LISTING_STATUS.live,
            ...((INDUSTRIES as readonly string[]).includes(industry) ? { industry: industry as never } : {}),
            ...(q
              ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { description: { contains: q, mode: "insensitive" as const } }] }
              : {}),
          },
          select: LISTING_SELECT,
          orderBy: sort === "new" ? [{ createdAt: "desc" }] : [{ likes: "desc" }, { createdAt: "desc" }],
          take: 20,
        });
        const marks = await listingMarks(actor.companyId, rows.map((r) => r.id));
        const cards = rows.map((r) => listingCard(r, { companyId: actor.companyId, ...marks })).filter((c): c is NonNullable<typeof c> => Boolean(c));
        return {
          count: cards.length,
          tools: cards.map((c) => ({
            id: c.id,
            name: c.name,
            industry: c.industry,
            about: c.description.length > 200 ? `${c.description.slice(0, 200)}…` : c.description,
            likes: c.likes,
            adds: c.adds,
            ...(c.added ? { alreadyAdded: true } : {}),
            ...(c.mine ? { sharedByThisAccount: true } : {}),
          })),
          libraryPage: "/app/estimates?view=library",
        };
      }
      if (action === "add") {
        if (!isManager(actor.role)) return { error: "Only managers can add Library tools to the account." };
        const id = str(args.listingId, 40);
        const listing = await prisma.estimatorListing.findFirst({
          where: { id, status: LISTING_STATUS.live },
          select: { id: true, name: true, industry: true },
        });
        if (!listing) return { error: "No Library tool with that id — search first." };
        return stage(ctx, {
          kind: "add_library_tool",
          title: `Add "${listing.name}" from the Library`,
          lines: [`${listing.industry} — a copy lands in this account's Estimate tools; prices can be edited there.`],
          endpoint: `/api/app/library/${listing.id}/add`,
          method: "POST",
          payload: {},
          confirmLabel: "Add tool",
          href: "/app/estimates",
        });
      }
      return { error: "action must be search or add" };
    },
  },
];
