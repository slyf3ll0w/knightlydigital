import { prisma } from "../db";
import {
  canSell,
  isManager,
  jobScope,
  appointmentScope,
} from "../permissions";
import {
  type Tool,
  str,
  num,
  day,
  money,
  clientName,
  fmtWhen,
  companyTz,
  findContact,
  schedulePayload,
  stage,
  parseLineItems,
  LINE_ITEMS_PARAM,
} from "./core";
import { itemsPayload } from "./pipeline";

/** Resolve an array of member ids/names against the active team (full-replace crew). */
async function resolveCrew(
  companyId: string,
  raw: unknown
): Promise<{ error: string } | { ids: string[]; names: string[] }> {
  const wanted = (Array.isArray(raw) ? raw : []).map((v) => str(v, 60)).filter(Boolean).slice(0, 10);
  if (wanted.length === 0) return { ids: [], names: [] };
  const team = await prisma.user.findMany({
    where: { companyId, isActive: true },
    select: { id: true, name: true },
  });
  const ids: string[] = [];
  const names: string[] = [];
  for (const w of wanted) {
    const m =
      team.find((u) => u.id === w) ??
      team.find((u) => u.name.toLowerCase() === w.toLowerCase());
    if (!m) return { error: `No active team member "${w}" — check list_team.` };
    if (!ids.includes(m.id)) {
      ids.push(m.id);
      names.push(m.name);
    }
  }
  return { ids, names };
}

/** Jobs + appointments: calendar read, job lifecycle, crew, notes, appointment lifecycle. */
export const scheduleTools: Tool[] = [
  {
    decl: {
      name: "get_schedule",
      description:
        "Jobs and appointments on the calendar between two dates (inclusive, max 31 days). Use for anything about the schedule: today, this week, a specific day.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "YYYY-MM-DD" },
          to: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["from", "to"],
      },
    },
    allowed: () => true,
    run: async (actor, args) => {
      const from = day(args.from);
      const to = day(args.to);
      if (!from || !to) return { error: "from/to must be YYYY-MM-DD" };
      // Generous TZ pad — widen OUTWARD: earliest local midnight on Earth is
      // UTC+14, latest local end-of-day is UTC-12. (Inverting these produces an
      // empty window and "nothing scheduled" answers for single-day queries.)
      const start = new Date(`${str(args.from, 10)}T00:00:00+14:00`);
      const end = new Date(`${str(args.to, 10)}T23:59:59-12:00`);
      if (end.getTime() - start.getTime() > 33 * 86400000) return { error: "Range too wide — max 31 days." };
      const tz = await companyTz(actor.companyId);
      const [jobs, appts] = await Promise.all([
        prisma.job.findMany({
          where: {
            companyId: actor.companyId, ...jobScope(actor),
            scheduledAt: { gte: start, lte: end }, status: { not: "ARCHIVED" },
          },
          take: 40, orderBy: { scheduledAt: "asc" },
          select: {
            jobNumber: true, title: true, scheduledAt: true, scheduledAnytime: true,
            contact: { select: { firstName: true, lastName: true, companyName: true } },
            assignments: { select: { user: { select: { name: true } } } },
          },
        }),
        prisma.appointment.findMany({
          where: {
            companyId: actor.companyId, ...appointmentScope(actor),
            scheduledAt: { gte: start, lte: end }, status: "SCHEDULED",
          },
          take: 40, orderBy: { scheduledAt: "asc" },
          select: {
            id: true, title: true, type: true, scheduledAt: true, scheduledAnytime: true, tentative: true,
            contact: { select: { firstName: true, lastName: true, companyName: true } },
            assignedTo: { select: { name: true } },
          },
        }),
      ]);
      return {
        jobs: jobs.map((j) => ({
          n: j.jobNumber, title: j.title, client: clientName(j.contact),
          when: j.scheduledAt ? fmtWhen(tz, j.scheduledAt, j.scheduledAnytime) : "unscheduled",
          crew: j.assignments.map((x) => x.user.name),
        })),
        appointments: appts.map((a) => ({
          id: a.id, title: a.title, type: a.type, client: clientName(a.contact),
          when: fmtWhen(tz, a.scheduledAt, a.scheduledAnytime),
          with: a.assignedTo?.name, ...(a.tentative ? { tentative: true } : {}),
        })),
      };
    },
  },

  // ── jobs ────────────────────────────────────────────────────────────────────

  {
    decl: {
      name: "create_job",
      description:
        "Stage a new job for a client, optionally scheduled (omit date to leave it unscheduled, omit time for 'anytime that day') and optionally with a crew (team member names or ids). Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD (optional)" },
          time: { type: "string", description: "HH:MM 24h company-local (optional)" },
          durationMinutes: { type: "number" },
          address: { type: "string", description: "defaults to the client's address" },
          crew: { type: "array", items: { type: "string" }, description: "team member names or ids" },
        },
        required: ["clientId", "title"],
      },
    },
    allowed: (a) => isManager(a.role) || a.role === "USER", // matches the jobs POST route
    run: async (actor, args, ctx) => {
      const contact = await findContact(actor, str(args.clientId, 40));
      if (!contact) return { error: "No client with that id (or not visible to this user)." };
      const title = str(args.title, 120);
      if (!title) return { error: "title is required" };
      let scheduleFields: Record<string, unknown> = {};
      let whenLabel = "unscheduled";
      if (str(args.date, 10)) {
        const sched = await schedulePayload(actor.companyId, args.date, args.time, args.durationMinutes);
        if ("error" in sched) return sched;
        scheduleFields = sched.fields;
        whenLabel = sched.label;
      }
      const crew = await resolveCrew(actor.companyId, args.crew);
      if ("error" in crew) return crew;
      const address = str(args.address, 200) || contact.address || undefined;
      return stage(ctx, {
        kind: "create_job",
        title: `New job: ${title} — ${whenLabel}`,
        lines: [
          `Client: ${clientName(contact)}`,
          address && `Address: ${address}`,
          crew.names.length > 0 && `Crew: ${crew.names.join(", ")}`,
          str(args.description, 300) && `Notes: ${str(args.description, 150)}`,
        ].filter(Boolean) as string[],
        endpoint: "/api/app/jobs",
        method: "POST",
        payload: {
          contactId: contact.id,
          title,
          description: str(args.description, 2000) || undefined,
          address,
          ...(crew.ids.length > 0 ? { assigneeIds: crew.ids } : {}),
          ...scheduleFields,
        },
      });
    },
  },
  {
    decl: {
      name: "update_job",
      description:
        "Stage job changes (by job number): reschedule (date/time, omit time for 'anytime'), retitle, description, address, crew (team member names/ids — REPLACES the whole crew), or line items (REPLACES all — call get_document first). Techs can only reschedule their own jobs. For status changes use update_job_status. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          jobNumber: { type: "number" },
          date: { type: "string", description: "YYYY-MM-DD" },
          time: { type: "string", description: "HH:MM 24h company-local (optional)" },
          durationMinutes: { type: "number" },
          title: { type: "string" },
          description: { type: "string" },
          address: { type: "string" },
          crew: { type: "array", items: { type: "string" }, description: "full new crew; empty array clears it" },
          lineItems: LINE_ITEMS_PARAM,
        },
        required: ["jobNumber"],
      },
    },
    allowed: (a) => a.role !== "SALES", // matches the jobs PATCH route
    run: async (actor, args, ctx) => {
      const n = num(args.jobNumber);
      const job = await prisma.job.findFirst({
        where: { companyId: actor.companyId, jobNumber: n ?? -1, ...jobScope(actor) },
        select: {
          id: true, title: true,
          contact: { select: { firstName: true, lastName: true, companyName: true } },
        },
      });
      if (!job) return { error: `No job #${n} (or not visible to this user).` };
      const payload: Record<string, unknown> = {};
      const lines: string[] = [];
      let whenLabel = "";
      if (str(args.date, 10)) {
        const sched = await schedulePayload(actor.companyId, args.date, args.time, args.durationMinutes);
        if ("error" in sched) return sched;
        Object.assign(payload, sched.fields);
        whenLabel = sched.label;
        lines.push(`Reschedule to: ${whenLabel}`);
      }
      const fullEdit = isManager(actor.role) || actor.role === "USER";
      const wantsFullEdit =
        str(args.title, 120) || str(args.description, 2000) || str(args.address, 200) ||
        args.crew !== undefined || args.lineItems !== undefined;
      if (wantsFullEdit && !fullEdit) {
        return { error: "Techs can only reschedule jobs — title/description/crew/line-item edits need a manager or Sales + Tech user." };
      }
      if (wantsFullEdit) {
        const title = str(args.title, 120);
        if (title) {
          payload.title = title;
          lines.push(`Title: ${title}`);
        }
        const description = str(args.description, 2000);
        if (description) {
          payload.description = description;
          lines.push(`Description: ${description.slice(0, 120)}`);
        }
        const address = str(args.address, 200);
        if (address) {
          payload.address = address;
          lines.push(`Address: ${address}`);
        }
        if (args.crew !== undefined) {
          const crew = await resolveCrew(actor.companyId, args.crew);
          if ("error" in crew) return crew;
          payload.assigneeIds = crew.ids;
          lines.push(crew.ids.length === 0 ? "Crew: cleared" : `Crew: ${crew.names.join(", ")}`);
        }
        if (args.lineItems !== undefined) {
          const items = parseLineItems(args.lineItems);
          if (items.length === 0) {
            return { error: "lineItems replaces ALL line items — call get_document for the current list and send the complete set." };
          }
          payload.lineItems = itemsPayload(items);
          const total = items.reduce((s, li) => s + li.quantity * li.unitPrice, 0);
          lines.push(...items.map((li) => `${li.description} × ${li.quantity} @ ${money(li.unitPrice)}`));
          lines.push(`New subtotal: ${money(total)}`);
        }
      }
      if (lines.length === 0) return { error: "Nothing to change — provide a new date, title, description, address, crew, or lineItems." };
      return stage(ctx, {
        kind: "update_job",
        title: whenLabel && lines.length === 1
          ? `Move job #${n} (${job.title}) to ${whenLabel}`
          : `Update job #${n} (${job.title})`,
        lines: [`Client: ${clientName(job.contact)}`, ...lines],
        endpoint: `/api/app/jobs/${job.id}`,
        method: "PATCH",
        payload,
      });
    },
  },
  {
    decl: {
      name: "update_job_status",
      description:
        "Stage a job status change (by job number). REQUIRES_INVOICING = work finished, ready to bill. ARCHIVED = closed. ACTIVE = reopen. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          jobNumber: { type: "number" },
          status: { type: "string", enum: ["ACTIVE", "REQUIRES_INVOICING", "ARCHIVED"] },
        },
        required: ["jobNumber", "status"],
      },
    },
    allowed: (a) => a.role !== "SALES", // matches the status route
    run: async (actor, args, ctx) => {
      const n = num(args.jobNumber);
      const status = str(args.status, 24);
      if (!["ACTIVE", "REQUIRES_INVOICING", "ARCHIVED"].includes(status)) {
        return { error: "status must be ACTIVE, REQUIRES_INVOICING, or ARCHIVED" };
      }
      const job = await prisma.job.findFirst({
        where: { companyId: actor.companyId, jobNumber: n ?? -1, ...jobScope(actor) },
        select: {
          id: true, title: true, status: true,
          contact: { select: { firstName: true, lastName: true, companyName: true } },
        },
      });
      if (!job) return { error: `No job #${n} (or not visible to this user).` };
      const labels: Record<string, string> = {
        ACTIVE: "Reopen",
        REQUIRES_INVOICING: "Mark complete (ready to invoice)",
        ARCHIVED: "Close",
      };
      return stage(ctx, {
        kind: "update_job_status",
        title: `${labels[status]}: job #${n} (${job.title})`,
        lines: [`Client: ${clientName(job.contact)}`, `Currently: ${job.status}`],
        endpoint: `/api/app/jobs/${job.id}/status`,
        method: "PATCH",
        payload: { status },
      });
    },
  },
  {
    decl: {
      name: "add_job_note",
      description: "Stage adding a note to a job (by job number) — visible to everyone who can see the job. Confirmation card required.",
      parameters: {
        type: "object",
        properties: { jobNumber: { type: "number" }, note: { type: "string" } },
        required: ["jobNumber", "note"],
      },
    },
    allowed: () => true, // anyone who can see the job can note it (jobScope)
    run: async (actor, args, ctx) => {
      const n = num(args.jobNumber);
      const job = await prisma.job.findFirst({
        where: { companyId: actor.companyId, jobNumber: n ?? -1, ...jobScope(actor) },
        select: {
          id: true, title: true,
          contact: { select: { firstName: true, lastName: true, companyName: true } },
        },
      });
      if (!job) return { error: `No job #${n} (or not visible to this user).` };
      const note = str(args.note, 2000);
      if (!note) return { error: "note is required" };
      return stage(ctx, {
        kind: "add_job_note",
        title: `Add note to job #${n} (${job.title})`,
        lines: [`Client: ${clientName(job.contact)}`, note.slice(0, 200)],
        endpoint: `/api/app/jobs/${job.id}/notes`,
        method: "POST",
        payload: { body: note },
      });
    },
  },

  // ── appointments ────────────────────────────────────────────────────────────

  {
    decl: {
      name: "schedule_appointment",
      description:
        "Stage an appointment (estimate visit, sales call) with a client. type: PHONE_CALL, VIDEO_CALL, or IN_PERSON (in-person needs an address — the client's address is used if none given). Omit time for an 'anytime that day' appointment. Managers can assign it to another member (memberId from list_team); it defaults to whoever books it. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string" },
          title: { type: "string", description: "e.g. Estimate visit" },
          type: { type: "string", enum: ["PHONE_CALL", "VIDEO_CALL", "IN_PERSON"] },
          date: { type: "string", description: "YYYY-MM-DD" },
          time: { type: "string", description: "HH:MM 24h, company-local (optional)" },
          durationMinutes: { type: "number", description: "default 60" },
          address: { type: "string" },
          memberId: { type: "string", description: "assign to this team member (managers only)" },
        },
        required: ["clientId", "title", "type", "date"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const contact = await findContact(actor, str(args.clientId, 40));
      if (!contact) return { error: "No client with that id (or not visible to this user)." };
      const type = ["PHONE_CALL", "VIDEO_CALL", "IN_PERSON"].includes(str(args.type, 20))
        ? str(args.type, 20)
        : "IN_PERSON";
      const address = str(args.address, 200) || contact.address || "";
      if (type === "IN_PERSON" && !address) {
        return { error: "In-person needs an address and the client has none on file — ask the user for one." };
      }
      const sched = await schedulePayload(actor.companyId, args.date, args.time, args.durationMinutes);
      if ("error" in sched) return sched;
      let assignedLine: string | null = null;
      let assignedToId: string | undefined;
      const memberId = str(args.memberId, 40);
      if (memberId) {
        if (!isManager(actor.role)) return { error: "Only managers can assign appointments to someone else." };
        const member = await prisma.user.findFirst({
          where: { id: memberId, companyId: actor.companyId, isActive: true },
          select: { id: true, name: true },
        });
        if (!member) return { error: "No active team member with that id — check list_team." };
        assignedToId = member.id;
        assignedLine = `With: ${member.name}`;
      }
      return stage(ctx, {
        kind: "schedule_appointment",
        title: `Appointment: ${str(args.title, 80)} — ${sched.label}`,
        lines: [
          `Client: ${clientName(contact)}`,
          `Type: ${type.replace("_", " ").toLowerCase()}`,
          type === "IN_PERSON" ? `Address: ${address}` : null,
          assignedLine,
        ].filter(Boolean) as string[],
        endpoint: "/api/app/appointments",
        method: "POST",
        payload: {
          contactId: contact.id,
          title: str(args.title, 80),
          type,
          ...sched.fields,
          ...(type === "IN_PERSON" ? { address } : {}),
          ...(assignedToId ? { assignedToId } : {}),
        },
      });
    },
  },
  {
    decl: {
      name: "update_appointment",
      description:
        "Stage appointment changes (by the id from get_schedule or get_client_activity): move it to a new date/time, retitle, change address/notes, or reassign to another member (managers only, memberId from list_team). To cancel use cancel_appointment. Confirmation card required.",
      parameters: {
        type: "object",
        properties: {
          appointmentId: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD" },
          time: { type: "string", description: "HH:MM 24h company-local (optional)" },
          durationMinutes: { type: "number" },
          title: { type: "string" },
          address: { type: "string" },
          notes: { type: "string" },
          memberId: { type: "string", description: "reassign to this team member (managers only)" },
        },
        required: ["appointmentId"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const appt = await prisma.appointment.findFirst({
        where: {
          id: str(args.appointmentId, 40), companyId: actor.companyId,
          ...appointmentScope(actor), status: "SCHEDULED",
        },
        select: {
          id: true, title: true,
          contact: { select: { firstName: true, lastName: true, companyName: true } },
        },
      });
      if (!appt) return { error: "No scheduled appointment with that id (or not visible to this user)." };
      const payload: Record<string, unknown> = {};
      const lines: string[] = [];
      let whenLabel = "";
      if (str(args.date, 10)) {
        const sched = await schedulePayload(actor.companyId, args.date, args.time, args.durationMinutes);
        if ("error" in sched) return sched;
        Object.assign(payload, sched.fields);
        whenLabel = sched.label;
        lines.push(`Move to: ${whenLabel}`);
      }
      const title = str(args.title, 120);
      if (title) {
        payload.title = title;
        lines.push(`Title: ${title}`);
      }
      const address = str(args.address, 300);
      if (address) {
        payload.address = address;
        lines.push(`Address: ${address}`);
      }
      const notes = str(args.notes, 2000);
      if (notes) {
        payload.notes = notes;
        lines.push(`Notes: ${notes.slice(0, 120)}`);
      }
      const memberId = str(args.memberId, 40);
      if (memberId) {
        if (!isManager(actor.role)) return { error: "Only managers can reassign appointments." };
        const member = await prisma.user.findFirst({
          where: { id: memberId, companyId: actor.companyId, isActive: true },
          select: { id: true, name: true },
        });
        if (!member) return { error: "No active team member with that id — check list_team." };
        payload.assignedToId = member.id;
        lines.push(`Reassign to: ${member.name}`);
      }
      if (lines.length === 0) return { error: "Nothing to change — provide a new date, title, address, notes, or memberId." };
      return stage(ctx, {
        kind: "update_appointment",
        title: whenLabel && lines.length === 1
          ? `Move "${appt.title}" to ${whenLabel}`
          : `Update "${appt.title}"`,
        lines: [`Client: ${clientName(appt.contact)}`, ...lines],
        endpoint: `/api/app/appointments/${appt.id}`,
        method: "PATCH",
        payload,
      });
    },
  },
  {
    decl: {
      name: "cancel_appointment",
      description:
        "Stage cancelling an appointment (by the id from get_schedule or get_client_activity). Confirmation card required.",
      parameters: {
        type: "object",
        properties: { appointmentId: { type: "string" } },
        required: ["appointmentId"],
      },
    },
    allowed: (a) => canSell(a.role),
    run: async (actor, args, ctx) => {
      const appt = await prisma.appointment.findFirst({
        where: {
          id: str(args.appointmentId, 40), companyId: actor.companyId,
          ...appointmentScope(actor), status: "SCHEDULED",
        },
        select: {
          id: true, title: true, scheduledAt: true, scheduledAnytime: true,
          contact: { select: { firstName: true, lastName: true, companyName: true } },
        },
      });
      if (!appt) return { error: "No scheduled appointment with that id (or not visible to this user)." };
      const tz = await companyTz(actor.companyId);
      return stage(ctx, {
        kind: "cancel_appointment",
        title: `Cancel "${appt.title}" — ${fmtWhen(tz, appt.scheduledAt, appt.scheduledAnytime)}`,
        lines: [`Client: ${clientName(appt.contact)}`],
        endpoint: `/api/app/appointments/${appt.id}`,
        method: "PATCH",
        payload: { status: "CANCELLED" },
      });
    },
  },
];
