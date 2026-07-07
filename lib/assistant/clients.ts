import { prisma } from "../db";
import {
  canSell,
  canSeeMoney,
  canSeePricing,
  isManager,
  contactScope,
} from "../permissions";
import {
  type Tool,
  str,
  money,
  clientName,
  findContact,
  stage,
} from "./core";

/** Clients: search/list/activity reads, contact CRUD, notes, portal invites, import undo. */
export const clientTools: Tool[] = [
  {
    decl: {
      name: "search_clients",
      description:
        "Search the client list by name, company, email, or phone. Word order doesn't matter. If nothing matches, the response includes the most recent clients so you can spot near-misses (spelling, nicknames) — check those before concluding someone doesn't exist.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Name, email, or phone fragment" } },
        required: ["query"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args) => {
      const q = str(args.query, 80);
      if (!q) return { error: "query is required" };
      // every word must match SOME field — "Laura Chen" finds firstName=Laura lastName=Chen
      const words = q.split(/\s+/).filter(Boolean).slice(0, 4);
      const select = {
        id: true, firstName: true, lastName: true, companyName: true,
        email: true, phone: true, status: true, city: true,
      } as const;
      const rows = await prisma.contact.findMany({
        where: {
          companyId: actor.companyId,
          ...contactScope(actor),
          AND: words.map((w) => ({
            OR: [
              { firstName: { contains: w, mode: "insensitive" as const } },
              { lastName: { contains: w, mode: "insensitive" as const } },
              { companyName: { contains: w, mode: "insensitive" as const } },
              { email: { contains: w, mode: "insensitive" as const } },
              { phone: { contains: w } },
            ],
          })),
        },
        take: 8,
        orderBy: { updatedAt: "desc" },
        select,
      });
      const shape = (c: (typeof rows)[number]) => ({
        id: c.id, name: clientName(c), status: c.status,
        email: c.email, phone: c.phone, city: c.city,
      });
      if (rows.length > 0) return { clients: rows.map(shape) };
      // no match → hand back the recent roster so the model can self-correct
      const recent = await prisma.contact.findMany({
        where: { companyId: actor.companyId, ...contactScope(actor) },
        take: 20, orderBy: { updatedAt: "desc" }, select,
      });
      return {
        noExactMatch: true,
        note: "Nothing matched that query. Here are the most recent clients — check for a close spelling or nickname before telling the user the client doesn't exist.",
        recentClients: recent.map(shape),
      };
    },
  },
  {
    decl: {
      name: "list_clients",
      description:
        "The client roster (up to 60, most recently updated first) with id, name, phone, email, status. Use this for bulk work ('update every client's ...') or any question about clients in general. For finding one specific person, prefer search_clients.",
      parameters: {
        type: "object",
        properties: { status: { type: "string", enum: ["LEAD", "ACTIVE", "ARCHIVED"] } },
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args) => {
      const valid = ["LEAD", "ACTIVE", "ARCHIVED"];
      const status = valid.includes(str(args.status, 12)) ? (str(args.status, 12) as never) : undefined;
      const where = { companyId: actor.companyId, ...contactScope(actor), status };
      const [rows, total] = await Promise.all([
        prisma.contact.findMany({
          where, take: 60, orderBy: { updatedAt: "desc" },
          select: {
            id: true, firstName: true, lastName: true, companyName: true,
            email: true, phone: true, status: true,
          },
        }),
        prisma.contact.count({ where }),
      ]);
      return {
        total,
        showing: rows.length,
        ...(total > rows.length
          ? { note: "More clients exist than shown — tell the user you handled the first 60 and to ask again to continue." }
          : {}),
        clients: rows.map((c) => ({
          id: c.id, name: clientName(c), phone: c.phone, email: c.email, status: c.status,
        })),
      };
    },
  },
  {
    decl: {
      name: "get_client_activity",
      description:
        "The full picture for one client (by id from search_clients): contact info, quotes, jobs, invoices, upcoming appointments, agreements/contracts and their signature status, subscriptions, and recent notes (with note ids for update_client_note).",
      parameters: {
        type: "object",
        properties: { clientId: { type: "string" } },
        required: ["clientId"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args) => {
      const id = str(args.clientId, 40);
      const c = await prisma.contact.findFirst({
        where: { id, companyId: actor.companyId, ...contactScope(actor) },
        select: {
          firstName: true, lastName: true, companyName: true, email: true, phone: true,
          address: true, status: true, leadSource: true,
          quotes: {
            take: 5, orderBy: { updatedAt: "desc" },
            select: { quoteNumber: true, status: true, total: true, title: true, sentAt: true },
          },
          jobs: {
            take: 5, orderBy: { updatedAt: "desc" },
            select: { jobNumber: true, title: true, status: true, scheduledAt: true },
          },
          invoices: {
            take: 5, orderBy: { updatedAt: "desc" },
            select: { invoiceNumber: true, status: true, total: true, dueDate: true },
          },
          appointments: {
            where: { status: "SCHEDULED" }, take: 3, orderBy: { scheduledAt: "asc" },
            select: { id: true, title: true, scheduledAt: true, type: true, tentative: true },
          },
          contracts: {
            take: 5, orderBy: { updatedAt: "desc" },
            select: { id: true, title: true, status: true, sentAt: true, signedAt: true },
          },
          subscriptions: {
            take: 5, orderBy: { updatedAt: "desc" },
            select: { id: true, name: true, status: true, interval: true, unitPrice: true, nextRunDate: true },
          },
          contactNotes: {
            take: 3, orderBy: { createdAt: "desc" },
            select: { id: true, body: true, createdAt: true, userId: true, user: { select: { name: true } } },
          },
        },
      });
      if (!c) return { error: "No client with that id (or not visible to this user)." };
      const seeMoney = canSeeMoney(actor);
      const seePrices = canSeePricing(actor.role);
      return {
        name: clientName(c),
        status: c.status,
        email: c.email,
        phone: c.phone,
        address: c.address,
        leadSource: c.leadSource,
        quotes: c.quotes.map((q) => ({
          n: q.quoteNumber, title: q.title, status: q.status,
          sent: q.sentAt?.toISOString().slice(0, 10),
          ...(seePrices ? { total: money(q.total) } : {}),
        })),
        jobs: c.jobs.map((j) => ({
          n: j.jobNumber, title: j.title, status: j.status,
          scheduled: j.scheduledAt?.toISOString().slice(0, 10) ?? "unscheduled",
        })),
        ...(seeMoney
          ? {
              invoices: c.invoices.map((i) => ({
                n: i.invoiceNumber, status: i.status, total: money(i.total),
                due: i.dueDate?.toISOString().slice(0, 10),
              })),
              subscriptions: c.subscriptions.map((s) => ({
                id: s.id, name: s.name, status: s.status, interval: s.interval,
                price: money(s.unitPrice), nextBill: s.nextRunDate.toISOString().slice(0, 10),
              })),
            }
          : {}),
        agreements: c.contracts.map((k) => ({
          id: k.id,
          title: k.title,
          status: k.status,
          sent: k.sentAt?.toISOString().slice(0, 10),
          signed: k.signedAt?.toISOString().slice(0, 10) ?? null,
        })),
        upcomingAppointments: c.appointments.map((a) => ({
          id: a.id, title: a.title, type: a.type, at: a.scheduledAt.toISOString(),
          ...(a.tentative ? { tentative: true } : {}),
        })),
        recentNotes: c.contactNotes.map((n) => ({
          id: n.id, by: n.user.name, mine: n.userId === actor.id,
          on: n.createdAt.toISOString().slice(0, 10), note: n.body.slice(0, 200),
        })),
      };
    },
  },

  // ── actions ─────────────────────────────────────────────────────────────────

  {
    decl: {
      name: "create_client",
      description:
        "Stage adding a new client. The user sees a confirmation card and must press Confirm. First and last name required.",
      parameters: {
        type: "object",
        properties: {
          firstName: { type: "string" }, lastName: { type: "string" },
          companyName: { type: "string" }, email: { type: "string" },
          phone: { type: "string" }, address: { type: "string" }, notes: { type: "string" },
        },
        required: ["firstName", "lastName"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (_actor, args, ctx) => {
      const firstName = str(args.firstName, 60);
      const lastName = str(args.lastName, 60);
      if (!firstName || !lastName) return { error: "firstName and lastName are required" };
      const payload = {
        firstName, lastName,
        companyName: str(args.companyName, 100) || undefined,
        email: str(args.email, 200) || undefined,
        phone: str(args.phone, 40) || undefined,
        address: str(args.address, 200) || undefined,
        notes: str(args.notes, 500) || undefined,
      };
      return stage(ctx, {
        kind: "create_client",
        title: `Add client ${firstName} ${lastName}`,
        lines: [
          payload.companyName && `Company: ${payload.companyName}`,
          payload.email && `Email: ${payload.email}`,
          payload.phone && `Phone: ${payload.phone}`,
          payload.address && `Address: ${payload.address}`,
        ].filter(Boolean) as string[],
        endpoint: "/api/app/contacts",
        method: "POST",
        payload,
      });
    },
  },
  {
    decl: {
      name: "update_client",
      description:
        "Stage updating a client's details (name, company, email, phone, address, notes). Only include fields that should change. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          firstName: { type: "string" }, lastName: { type: "string" },
          companyName: { type: "string" },
          email: { type: "string" }, phone: { type: "string" },
          address: { type: "string" }, notes: { type: "string" },
        },
        required: ["clientId"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const contact = await findContact(actor, str(args.clientId, 40));
      if (!contact) return { error: "No client with that id (or not visible to this user)." };
      const payload: Record<string, unknown> = {};
      const lines: string[] = [];
      const fields: [key: string, max: number, label: string][] = [
        ["firstName", 60, "First name"], ["lastName", 60, "Last name"],
        ["companyName", 100, "Company"], ["email", 200, "Email"],
        ["phone", 40, "Phone"], ["address", 200, "Address"], ["notes", 500, "Notes"],
      ];
      for (const [key, max, label] of fields) {
        const v = str(args[key], max);
        if (v) {
          payload[key] = v;
          lines.push(`${label}: ${v}`);
        }
      }
      if (lines.length === 0) return { error: "Nothing to change — provide at least one field." };
      return stage(ctx, {
        kind: "update_client",
        title: `Update ${clientName(contact)}`,
        lines,
        endpoint: `/api/app/contacts/${contact.id}`,
        method: "PATCH",
        payload,
      });
    },
  },
  {
    decl: {
      name: "set_client_status",
      description:
        "Stage changing a client's status: LEAD, ACTIVE, or ARCHIVED. Archiving hides a client without destroying anything — ALWAYS suggest this instead of deletion for clients with real history. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          status: { type: "string", enum: ["LEAD", "ACTIVE", "ARCHIVED"] },
        },
        required: ["clientId", "status"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const contact = await findContact(actor, str(args.clientId, 40));
      if (!contact) return { error: "No client with that id (or not visible to this user)." };
      const status = str(args.status, 12);
      if (!["LEAD", "ACTIVE", "ARCHIVED"].includes(status)) {
        return { error: "status must be LEAD, ACTIVE, or ARCHIVED" };
      }
      const verbs: Record<string, string> = { ARCHIVED: "Archive", ACTIVE: "Mark active", LEAD: "Mark as lead" };
      return stage(ctx, {
        kind: "set_client_status",
        title: `${verbs[status]}: ${clientName(contact)}`,
        lines: status === "ARCHIVED" ? ["Hidden from pickers and lists — reversible anytime."] : [],
        endpoint: `/api/app/contacts/${contact.id}`,
        method: "PATCH",
        payload: { status },
      });
    },
  },
  {
    decl: {
      name: "assign_client",
      description:
        "Stage assigning a client to a team member (their lead owner — Sales/Tech roles only see clients assigned to them). Get the member's id from list_team first. Pass an empty memberId to unassign. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          memberId: { type: "string", description: "User id from list_team; empty string unassigns" },
        },
        required: ["clientId"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const contact = await findContact(actor, str(args.clientId, 40));
      if (!contact) return { error: "No client with that id (or not visible to this user)." };
      const memberId = str(args.memberId, 40);
      if (!memberId) {
        return stage(ctx, {
          kind: "assign_client",
          title: `Unassign ${clientName(contact)}`,
          lines: ["Removes the assigned team member — managers still see the client."],
          endpoint: `/api/app/contacts/${contact.id}`,
          method: "PATCH",
          payload: { assignedToId: null },
        });
      }
      const member = await prisma.user.findFirst({
        where: { id: memberId, companyId: actor.companyId, isActive: true },
        select: { id: true, name: true, role: true },
      });
      if (!member) return { error: "No active team member with that id — check list_team." };
      return stage(ctx, {
        kind: "assign_client",
        title: `Assign ${clientName(contact)} to ${member.name}`,
        lines: [`${member.name} becomes this client's lead.`],
        endpoint: `/api/app/contacts/${contact.id}`,
        method: "PATCH",
        payload: { assignedToId: member.id },
      });
    },
  },
  {
    decl: {
      name: "add_client_note",
      description: "Stage adding a note to a client's record. Confirmation card required.",
      parameters: {
        type: "object",
        properties: { clientId: { type: "string" }, note: { type: "string" } },
        required: ["clientId", "note"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const contact = await findContact(actor, str(args.clientId, 40));
      if (!contact) return { error: "No client with that id (or not visible to this user)." };
      const note = str(args.note, 2000);
      if (!note) return { error: "note is required" };
      return stage(ctx, {
        kind: "add_client_note",
        title: `Add note to ${clientName(contact)}`,
        lines: [note.slice(0, 200)],
        endpoint: `/api/app/contacts/${contact.id}/notes`,
        method: "POST",
        payload: { body: note },
      });
    },
  },
  {
    decl: {
      name: "update_client_note",
      description:
        "Stage editing or deleting one of a client's notes (note id from get_client_activity). Only the note's author can edit; the author or a manager can delete. Pass newText to edit, or remove: true to delete. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          noteId: { type: "string" },
          newText: { type: "string" },
          remove: { type: "boolean" },
        },
        required: ["clientId", "noteId"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const contact = await findContact(actor, str(args.clientId, 40));
      if (!contact) return { error: "No client with that id (or not visible to this user)." };
      const note = await prisma.contactNote.findFirst({
        where: { id: str(args.noteId, 40), contactId: contact.id },
        select: { id: true, body: true, userId: true, user: { select: { name: true } } },
      });
      if (!note) return { error: "No note with that id on this client — check get_client_activity." };
      if (args.remove === true) {
        if (note.userId !== actor.id && !isManager(actor.role)) {
          return { error: `Only ${note.user.name} (the author) or a manager can delete this note.` };
        }
        return stage(ctx, {
          kind: "update_client_note",
          title: `Delete note on ${clientName(contact)}`,
          lines: [`"${note.body.slice(0, 120)}"`, `By ${note.user.name}. This cannot be undone.`],
          endpoint: `/api/app/contacts/${contact.id}/notes/${note.id}`,
          method: "DELETE",
          payload: {},
          danger: true,
        });
      }
      const newText = str(args.newText, 5000);
      if (!newText) return { error: "Provide newText to edit, or remove: true to delete." };
      if (note.userId !== actor.id) {
        return { error: `Only ${note.user.name} (the author) can edit this note — a manager can delete it instead.` };
      }
      return stage(ctx, {
        kind: "update_client_note",
        title: `Edit note on ${clientName(contact)}`,
        lines: [`New text: ${newText.slice(0, 200)}`],
        endpoint: `/api/app/contacts/${contact.id}/notes/${note.id}`,
        method: "PATCH",
        payload: { body: newText },
      });
    },
  },
  {
    decl: {
      name: "send_portal_invite",
      description:
        "Stage emailing a client their private portal link (magic sign-in to see their quotes, invoices, visits). Client must have an email on file. Confirmation card required — this SENDS a real email once confirmed.",
      parameters: {
        type: "object",
        properties: { clientId: { type: "string" } },
        required: ["clientId"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const contact = await prisma.contact.findFirst({
        where: { id: str(args.clientId, 40), companyId: actor.companyId, ...contactScope(actor) },
        select: { id: true, firstName: true, lastName: true, companyName: true, email: true },
      });
      if (!contact) return { error: "No client with that id (or not visible to this user)." };
      if (!contact.email) return { error: "This client has no email on file — add one first (update_client)." };
      return stage(ctx, {
        kind: "send_portal_invite",
        title: `Email portal link to ${clientName(contact)}`,
        lines: [`Sends to: ${contact.email}`],
        endpoint: `/api/app/contacts/${contact.id}/portal-invite`,
        method: "POST",
        payload: {},
      });
    },
  },
  {
    decl: {
      name: "undo_import",
      description:
        "Undo a CSV client import (managers). Call with no batchId to list recent import batches; then stage the undo with a batchId. Only imported contacts with NO work history (no quotes/jobs/invoices/payments/appointments) are removed — the rest are kept. Confirmation card required.",
      parameters: {
        type: "object",
        properties: { batchId: { type: "string" } },
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const batchId = str(args.batchId, 64);
      if (!batchId) {
        const batches = await prisma.contact.groupBy({
          by: ["importBatchId"],
          where: { companyId: actor.companyId, importBatchId: { not: null } },
          _count: { _all: true },
          _max: { createdAt: true },
          orderBy: { _max: { createdAt: "desc" } },
          take: 10,
        });
        if (batches.length === 0) return { note: "No import batches found — nothing to undo." };
        return {
          batches: batches.map((b) => ({
            batchId: b.importBatchId,
            contacts: b._count._all,
            importedOn: b._max.createdAt?.toISOString().slice(0, 10),
          })),
        };
      }
      const noWork = {
        quotes: { none: {} }, jobs: { none: {} }, invoices: { none: {} },
        payments: { none: {} }, appointments: { none: {} },
      } as const;
      const [total, removable] = await Promise.all([
        prisma.contact.count({ where: { companyId: actor.companyId, importBatchId: batchId } }),
        prisma.contact.count({ where: { companyId: actor.companyId, importBatchId: batchId, ...noWork } }),
      ]);
      if (total === 0) return { error: "No contacts with that batchId — call undo_import without arguments to list batches." };
      return stage(ctx, {
        kind: "undo_import",
        title: `Undo import batch — remove ${removable} of ${total} contact(s)`,
        lines: [
          removable < total
            ? `${total - removable} contact(s) have real work history and will be KEPT.`
            : "None of these contacts have work history.",
          "This cannot be undone.",
        ],
        endpoint: `/api/app/contacts/import?batchId=${encodeURIComponent(batchId)}`,
        method: "DELETE",
        payload: {},
        danger: true,
      });
    },
  },
];
