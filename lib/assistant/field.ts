import { prisma } from "../db";
import { type Actor, isManager, jobScope } from "../permissions";
import { parseRouteDate, resolveRouteDay, resolveDriveLegs } from "../route-plan";
import { suggestTimes } from "../find-a-time";
import { type Tool, str, num, day, clientName, companyTz, fmtWhen, stage } from "./core";

/**
 * Field operations that shipped after Atlas v7: job checklists, clock in/out,
 * on-my-way + review texts, job sign-off, time entries, time blocks, the
 * live team map, route planning, Find-a-Time, and team chat.
 *
 * Route gating mirrors the API: the job actions deny SALES (techs allowed),
 * time entries and the team map are manager-only, time blocks are self-serve
 * for your own calendar and manager-only for anyone else's.
 */

const notSales = (a: Actor) => a.role !== "SALES";

async function findJob(actor: Actor, n: number | null) {
  if (n === null) return null;
  return prisma.job.findFirst({
    where: { companyId: actor.companyId, jobNumber: n, ...jobScope(actor) },
    select: {
      id: true, jobNumber: true, title: true, status: true, address: true, scheduledAt: true, scheduledAnytime: true,
      onMyWaySentAt: true, completionSignatureName: true, completionSignedAt: true,
      contact: { select: { firstName: true, lastName: true, companyName: true, phone: true } },
    },
  });
}

async function findMember(companyId: string, idOrName: string) {
  const v = str(idOrName, 80);
  if (!v) return null;
  const byId = await prisma.user.findFirst({ where: { id: v, companyId, isActive: true }, select: { id: true, name: true } });
  if (byId) return byId;
  return prisma.user.findFirst({
    where: { companyId, isActive: true, name: { contains: v, mode: "insensitive" } },
    select: { id: true, name: true },
  });
}

export const fieldTools: Tool[] = [
  {
    decl: {
      name: "get_job_checklist",
      description: "The checklist on a job (items come from the price-book services on it): item ids, done/skipped/open, who did them. Needed before update_checklist_item.",
      parameters: { type: "object", properties: { jobNumber: { type: "integer" } }, required: ["jobNumber"] },
    },
    allowed: () => true,
    run: async (actor, args) => {
      const job = await findJob(actor, num(args.jobNumber));
      if (!job) return { error: `No job #${args.jobNumber}.` };
      const items = await prisma.jobChecklistItem.findMany({
        where: { jobId: job.id }, orderBy: { sortOrder: "asc" },
        select: { id: true, label: true, sourceName: true, doneAt: true, skipReason: true, doneBy: { select: { name: true } } },
      });
      return {
        job: `#${job.jobNumber} ${job.title}`,
        items: items.map((i) => ({ id: i.id, label: i.label, service: i.sourceName, state: i.doneAt ? "done" : i.skipReason ? "skipped" : "open", by: i.doneBy?.name ?? null, skipReason: i.skipReason })),
        done: items.filter((i) => i.doneAt).length, total: items.length,
      };
    },
  },
  {
    decl: {
      name: "update_checklist_item",
      description: "Stage marking one checklist item done, skipped (reason required), or reopened. Get item ids from get_job_checklist. One call per item — several per round is fine.",
      parameters: {
        type: "object",
        properties: { jobNumber: { type: "integer" }, itemId: { type: "string" }, action: { type: "string", enum: ["done", "skip", "reopen"] }, reason: { type: "string", description: "why it was skipped" } },
        required: ["jobNumber", "itemId", "action"],
      },
    },
    allowed: notSales,
    run: async (actor, args, ctx) => {
      const job = await findJob(actor, num(args.jobNumber));
      if (!job) return { error: `No job #${args.jobNumber}.` };
      const item = await prisma.jobChecklistItem.findFirst({ where: { id: str(args.itemId, 40), jobId: job.id }, select: { id: true, label: true } });
      if (!item) return { error: "No checklist item with that id on this job." };
      const action = str(args.action, 8);
      if (!["done", "skip", "reopen"].includes(action)) return { error: "action must be done, skip, or reopen" };
      const reason = str(args.reason, 500);
      if (action === "skip" && !reason) return { error: "A reason is required to skip an item." };
      return stage(ctx, {
        kind: "update_checklist_item",
        title: `${action === "done" ? "Check off" : action === "skip" ? "Skip" : "Reopen"} "${item.label}" on job #${job.jobNumber}`,
        lines: [`Job: ${job.title}`, ...(reason ? [`Reason: ${reason}`] : [])],
        endpoint: `/api/app/jobs/${job.id}/checklist`, method: "PATCH",
        payload: { itemId: item.id, action, ...(reason ? { reason } : {}) },
        confirmLabel: action === "done" ? "Mark done" : action === "skip" ? "Skip item" : "Reopen",
        href: `/app/jobs/${job.id}`,
      });
    },
  },
  {
    decl: {
      name: "clock",
      description: "Stage clocking the CURRENT user in to a job or out of it (time tracking). Clocking in to a new job auto-closes any open entry. You can only clock the signed-in user — for someone else's hours use manage_time_entry (managers).",
      parameters: { type: "object", properties: { jobNumber: { type: "integer" }, action: { type: "string", enum: ["in", "out"] } }, required: ["jobNumber", "action"] },
    },
    allowed: notSales,
    run: async (actor, args, ctx) => {
      const job = await findJob(actor, num(args.jobNumber));
      if (!job) return { error: `No job #${args.jobNumber}.` };
      const action = str(args.action, 3) === "out" ? "out" : "in";
      const open = await prisma.timeEntry.findFirst({ where: { companyId: actor.companyId, userId: actor.id, endedAt: null }, select: { startedAt: true, job: { select: { jobNumber: true, title: true } } } });
      if (action === "out" && !open) return { error: "You're not clocked in to anything right now." };
      return stage(ctx, {
        kind: "clock",
        title: action === "in" ? `Clock in to job #${job.jobNumber}` : `Clock out of job #${open?.job?.jobNumber ?? job.jobNumber}`,
        lines: [
          `${job.title} — ${clientName(job.contact)}`,
          ...(action === "in" && open ? [`Closes your open entry on ${open.job ? `#${open.job.jobNumber}` : "another job"} first.`] : []),
        ],
        endpoint: `/api/app/jobs/${job.id}/clock`, method: "POST",
        payload: { action, clientKey: `atlas-${Date.now()}` },
        confirmLabel: action === "in" ? "Clock in" : "Clock out",
      });
    },
  },
  {
    decl: {
      name: "send_on_my_way",
      description: "Prepare the 'On my way' text for a job: returns the client's number and a ready message (the text itself goes out from the user's own phone — the app opens Messages), and stages logging it on the job so the office sees it. Give the user the sms link from the result.",
      parameters: { type: "object", properties: { jobNumber: { type: "integer" }, etaMinutes: { type: "integer", description: "if the user told you their ETA" } }, required: ["jobNumber"] },
    },
    allowed: notSales,
    run: async (actor, args, ctx) => {
      const job = await findJob(actor, num(args.jobNumber));
      if (!job) return { error: `No job #${args.jobNumber}.` };
      if (!job.contact.phone) return { error: "This client has no phone number on file — add one with update_client first." };
      const eta = num(args.etaMinutes);
      const company = await prisma.company.findUnique({ where: { id: actor.companyId }, select: { name: true } });
      const text = `Hi ${job.contact.firstName}, this is ${actor.name} with ${company?.name ?? "us"} — I'm on my way${eta ? ` and should be there in about ${eta} minutes` : ""}.`;
      const smsLink = `sms:${job.contact.phone.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(text)}`;
      stage(ctx, {
        kind: "on_my_way",
        title: `Log "On my way" for job #${job.jobNumber}`,
        lines: [`To: ${clientName(job.contact)} (${job.contact.phone})`, `Text: ${text}`],
        endpoint: `/api/app/jobs/${job.id}/on-my-way`, method: "POST", payload: {},
        confirmLabel: "Log it",
      });
      return { staged: true, smsLink, text, note: "Tell the user to tap the sms link to send the text from their phone, then Confirm the card to log it." };
    },
  },
  {
    decl: {
      name: "request_review",
      description: "Prepare a review-request text after a job (sms goes from the user's phone; the app records that it was asked). Returns the sms link + message and stages the record.",
      parameters: { type: "object", properties: { jobNumber: { type: "integer" } }, required: ["jobNumber"] },
    },
    allowed: notSales,
    run: async (actor, args, ctx) => {
      const job = await findJob(actor, num(args.jobNumber));
      if (!job) return { error: `No job #${args.jobNumber}.` };
      if (!job.contact.phone) return { error: "This client has no phone number on file." };
      const company = await prisma.company.findUnique({ where: { id: actor.companyId }, select: { name: true, reviewLink: true } });
      if (!company?.reviewLink) return { error: "No review link is set up yet — set it in company settings (update_company_settings reviewLink) first." };
      const text = `Thanks for choosing ${company.name}, ${job.contact.firstName}! If you have a minute, a quick review would mean a lot: ${company.reviewLink}`;
      const smsLink = `sms:${job.contact.phone.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(text)}`;
      stage(ctx, {
        kind: "request_review",
        title: `Record review request for job #${job.jobNumber}`,
        lines: [`To: ${clientName(job.contact)} (${job.contact.phone})`, `Text: ${text}`],
        endpoint: `/api/app/jobs/${job.id}/review-request`, method: "POST", payload: {},
        confirmLabel: "Record it",
      });
      return { staged: true, smsLink, text };
    },
  },
  {
    decl: {
      name: "record_job_signoff",
      description: "Stage recording the client's completion sign-off on a job (typed name). Only when the client has actually approved the finished work — this is the paper trail.",
      parameters: { type: "object", properties: { jobNumber: { type: "integer" }, signatureName: { type: "string" } }, required: ["jobNumber", "signatureName"] },
    },
    allowed: notSales,
    run: async (actor, args, ctx) => {
      const job = await findJob(actor, num(args.jobNumber));
      if (!job) return { error: `No job #${args.jobNumber}.` };
      const name = str(args.signatureName, 120);
      if (!name) return { error: "signatureName is required." };
      if (job.completionSignedAt) return { error: `Already signed off by ${job.completionSignatureName} on ${job.completionSignedAt.toISOString().slice(0, 10)}.` };
      return stage(ctx, {
        kind: "job_signoff",
        title: `Record sign-off on job #${job.jobNumber}`,
        lines: [`${job.title} — ${clientName(job.contact)}`, `Signed by: ${name}`],
        endpoint: `/api/app/jobs/${job.id}/signature`, method: "POST", payload: { signatureName: name },
        confirmLabel: "Record sign-off", href: `/app/jobs/${job.id}`,
      });
    },
  },
  {
    decl: {
      name: "manage_time_entry",
      description: "Managers: stage adding a manual time entry (paper timesheet, forgotten punch) or editing one (fix times, attach/detach a job, add a note). Find entry ids with query_records entity time_entries. Delete via delete_record entity time_entry.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["add", "edit"] },
          entryId: { type: "string", description: "edit only" },
          member: { type: "string", description: "add: team member id or name" },
          jobNumber: { type: "integer", description: "attach to this job (0 to detach on edit)" },
          startedAt: { type: "string", description: "ISO datetime or 'YYYY-MM-DD HH:mm' in company time" },
          endedAt: { type: "string", description: "ISO datetime or 'YYYY-MM-DD HH:mm'; edit: 'open' reopens the entry" },
          note: { type: "string" },
        },
        required: ["action"],
      },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor, args, ctx) => {
      const tz = await companyTz(actor.companyId);
      const parse = (v: unknown): Date | null => {
        const s = str(v, 40);
        if (!s) return null;
        const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})$/.exec(s);
        if (m) {
          // wall time in the company tz → UTC via the schedule helper's approach
          const probe = new Date(`${m[1]}T${m[2]}:${m[3]}:00Z`);
          const offset = probe.getTime() - new Date(probe.toLocaleString("en-US", { timeZone: tz })).getTime();
          return new Date(probe.getTime() + offset);
        }
        const d = new Date(s);
        return Number.isNaN(d.getTime()) ? null : d;
      };
      const action = str(args.action, 4);
      const jobN = num(args.jobNumber);
      const job = jobN && jobN > 0 ? await prisma.job.findFirst({ where: { companyId: actor.companyId, jobNumber: jobN }, select: { id: true, jobNumber: true, title: true } }) : null;
      if (jobN && jobN > 0 && !job) return { error: `No job #${jobN}.` };
      const note = str(args.note, 500);
      if (action === "add") {
        const member = await findMember(actor.companyId, str(args.member, 80));
        if (!member) return { error: "Which team member? Give an id or name from list_team." };
        const start = parse(args.startedAt);
        const end = parse(args.endedAt);
        if (!start || !end) return { error: "startedAt and endedAt are both required for a manual entry." };
        if (end <= start || end.getTime() - start.getTime() > 24 * 3600_000) return { error: "End must be after start and within 24 hours." };
        const hrs = Math.round(((end.getTime() - start.getTime()) / 3_600_000) * 100) / 100;
        return stage(ctx, {
          kind: "add_time_entry",
          title: `Add ${hrs} h for ${member.name}`,
          lines: [`${fmtWhen(tz, start, false)} → ${fmtWhen(tz, end, false)}`, ...(job ? [`Job: #${job.jobNumber} ${job.title}`] : []), ...(note ? [`Note: ${note}`] : [])],
          endpoint: "/api/app/time-entries", method: "POST",
          payload: { userId: member.id, startedAt: start.toISOString(), endedAt: end.toISOString(), ...(job ? { jobId: job.id } : {}), ...(note ? { note } : {}) },
          confirmLabel: "Add entry", href: "/app/timesheets",
        });
      }
      const entry = await prisma.timeEntry.findFirst({ where: { id: str(args.entryId, 40), companyId: actor.companyId }, select: { id: true, startedAt: true, endedAt: true, user: { select: { name: true } } } });
      if (!entry) return { error: "No time entry with that id — find it with query_records entity time_entries." };
      const payload: Record<string, unknown> = {};
      const lines: string[] = [];
      const start = parse(args.startedAt);
      if (start) { payload.startedAt = start.toISOString(); lines.push(`Start: ${fmtWhen(tz, start, false)}`); }
      if (str(args.endedAt, 10).toLowerCase() === "open") { payload.endedAt = null; lines.push("Reopens the entry (clocked in)"); }
      else { const end = parse(args.endedAt); if (end) { payload.endedAt = end.toISOString(); lines.push(`End: ${fmtWhen(tz, end, false)}`); } }
      if (jobN === 0) { payload.jobId = null; lines.push("Detach from job"); }
      else if (job) { payload.jobId = job.id; lines.push(`Job: #${job.jobNumber} ${job.title}`); }
      if (note) { payload.note = note; lines.push(`Note: ${note}`); }
      if (Object.keys(payload).length === 0) return { error: "Nothing to change." };
      return stage(ctx, {
        kind: "update_time_entry",
        title: `Edit ${entry.user.name}'s time entry`,
        lines, endpoint: `/api/app/time-entries/${entry.id}`, method: "PATCH", payload,
        confirmLabel: "Save changes", href: "/app/timesheets",
      });
    },
  },
  {
    decl: {
      name: "manage_time_block",
      description: "Blocked-off time on the calendar (vacation, lunch, shop day). action list (date range), create, update. Your own calendar is self-serve; a teammate's or a company-wide block needs a manager. Delete via delete_record entity time_block.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list", "create", "update"] },
          blockId: { type: "string", description: "update only" },
          title: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD (all-day, or with start/end times)" },
          endDate: { type: "string", description: "YYYY-MM-DD for multi-day blocks" },
          startTime: { type: "string", description: "HH:mm (omit for all day)" },
          endTime: { type: "string", description: "HH:mm" },
          member: { type: "string", description: "team member id or name; 'everyone' = company-wide (managers); omit = the current user" },
          from: { type: "string", description: "list: YYYY-MM-DD" },
          to: { type: "string", description: "list: YYYY-MM-DD" },
        },
        required: ["action"],
      },
    },
    allowed: () => true,
    run: async (actor, args, ctx) => {
      const tz = await companyTz(actor.companyId);
      const action = str(args.action, 8);
      if (action === "list") {
        const from = day(args.from) ?? new Date();
        const to = day(args.to) ?? new Date(from.getTime() + 30 * 86400000);
        const rows = await prisma.timeBlock.findMany({
          where: { companyId: actor.companyId, startAt: { lt: new Date(to.getTime() + 12 * 3600_000) }, endAt: { gt: new Date(from.getTime() - 12 * 3600_000) }, ...(isManager(actor.role) ? {} : { OR: [{ userId: actor.id }, { userId: null }] }) },
          orderBy: { startAt: "asc" }, take: 60,
          select: { id: true, title: true, startAt: true, endAt: true, allDay: true, user: { select: { name: true } } },
        });
        return { blocks: rows.map((b) => ({ id: b.id, title: b.title, who: b.user?.name ?? "everyone", from: fmtWhen(tz, b.startAt, b.allDay), to: fmtWhen(tz, b.endAt, b.allDay), allDay: b.allDay })) };
      }
      const memberArg = str(args.member, 80);
      let forUserId: string | null | undefined = undefined;
      let who = actor.name;
      if (memberArg.toLowerCase() === "everyone" || memberArg.toLowerCase() === "company") {
        if (!isManager(actor.role)) return { error: "Only managers can block time company-wide." };
        forUserId = null; who = "everyone";
      } else if (memberArg) {
        const m = await findMember(actor.companyId, memberArg);
        if (!m) return { error: "No active team member matches that." };
        if (m.id !== actor.id && !isManager(actor.role)) return { error: "Only managers can block someone else's calendar." };
        if (m.id !== actor.id) { forUserId = m.id; who = m.name; }
      }
      const d = day(args.date);
      const startTime = str(args.startTime, 5);
      const endTime = str(args.endTime, 5);
      const allDay = !/^\d{2}:\d{2}$/.test(startTime);
      const ymd = (x: Date) => x.toISOString().slice(0, 10);
      const wall = (dateStr: string, hhmm: string) => {
        const probe = new Date(`${dateStr}T${hhmm}:00Z`);
        const offset = probe.getTime() - new Date(probe.toLocaleString("en-US", { timeZone: tz })).getTime();
        return new Date(probe.getTime() + offset);
      };
      let startAt: Date | undefined; let endAt: Date | undefined;
      if (d) {
        const endD = day(args.endDate) ?? d;
        if (allDay) { startAt = wall(ymd(d), "00:00"); endAt = new Date(wall(ymd(endD), "00:00").getTime() + 86400000); }
        else { startAt = wall(ymd(d), startTime); endAt = wall(ymd(endD), /^\d{2}:\d{2}$/.test(endTime) ? endTime : startTime); if (endAt <= startAt) endAt = new Date(startAt.getTime() + 3600_000); }
      }
      const title = str(args.title, 120);
      if (action === "create") {
        if (!startAt || !endAt) return { error: "date is required (YYYY-MM-DD), plus startTime/endTime for a partial day." };
        return stage(ctx, {
          kind: "create_time_block",
          title: `Block off ${who}: ${title || "Blocked off"}`,
          lines: [`${fmtWhen(tz, startAt, allDay)} → ${fmtWhen(tz, allDay ? new Date(endAt.getTime() - 1) : endAt, allDay)}`],
          endpoint: "/api/app/time-blocks", method: "POST",
          payload: { startAt: startAt.toISOString(), endAt: endAt.toISOString(), allDay, ...(title ? { title } : {}), ...(forUserId !== undefined ? { forUserId } : {}) },
          confirmLabel: "Block time", href: "/app/schedule",
        });
      }
      if (action === "update") {
        const block = await prisma.timeBlock.findFirst({ where: { id: str(args.blockId, 40), companyId: actor.companyId, ...(isManager(actor.role) ? {} : { userId: actor.id }) }, select: { id: true, title: true } });
        if (!block) return { error: "No time block with that id (list them first)." };
        const payload: Record<string, unknown> = {};
        const lines: string[] = [];
        if (title) { payload.title = title; lines.push(`Title: ${title}`); }
        if (startAt && endAt) { payload.startAt = startAt.toISOString(); payload.endAt = endAt.toISOString(); payload.allDay = allDay; lines.push(`${fmtWhen(tz, startAt, allDay)} → ${fmtWhen(tz, allDay ? new Date(endAt.getTime() - 1) : endAt, allDay)}`); }
        if (forUserId !== undefined) { payload.forUserId = forUserId; lines.push(`For: ${who}`); }
        if (!lines.length) return { error: "Nothing to change." };
        return stage(ctx, { kind: "update_time_block", title: `Update block "${block.title}"`, lines, endpoint: `/api/app/time-blocks/${block.id}`, method: "PATCH", payload, confirmLabel: "Save changes", href: "/app/schedule" });
      }
      return { error: "action must be list, create, or update" };
    },
  },
  {
    decl: {
      name: "team_map",
      description: "Managers: who is clocked in right now, on which job, and their last known position (from the phone's clock-in stamp / location pings).",
      parameters: { type: "object", properties: {} },
    },
    allowed: (a) => isManager(a.role),
    run: async (actor) => {
      const tz = await companyTz(actor.companyId);
      const open = await prisma.timeEntry.findMany({
        where: { companyId: actor.companyId, endedAt: null },
        select: {
          startedAt: true, startLat: true, startLng: true,
          user: { select: { name: true } }, job: { select: { jobNumber: true, title: true, address: true } },
          locationPings: { orderBy: { recordedAt: "desc" }, take: 1, select: { lat: true, lng: true, recordedAt: true } },
        },
      });
      return {
        clockedIn: open.map((t) => {
          const ping = t.locationPings[0];
          return {
            who: t.user.name, since: fmtWhen(tz, t.startedAt, false),
            job: t.job ? `#${t.job.jobNumber} ${t.job.title}` : "(no job)", jobAddress: t.job?.address ?? null,
            position: ping ? { lat: ping.lat, lng: ping.lng, at: fmtWhen(tz, ping.recordedAt, false) } : t.startLat != null ? { lat: t.startLat, lng: t.startLng, at: "clock-in" } : null,
          };
        }),
        note: open.length === 0 ? "Nobody is clocked in right now." : undefined,
      };
    },
  },
  {
    decl: {
      name: "get_route_plan",
      description: "One day's field route: every mapped stop (jobs + in-person appointments) with times, crew, and drive minutes per tech, plus the unscheduled backlog. Use before optimize_route or when asked about drive time / who is where on a day.",
      parameters: { type: "object", properties: { date: { type: "string", description: "YYYY-MM-DD, default today" } } },
    },
    allowed: () => true,
    run: async (actor, args) => {
      const tz = await companyTz(actor.companyId);
      const date = parseRouteDate(str(args.date, 10) || null, tz);
      const dayPlan = await resolveRouteDay(actor, date);
      const drive = dayPlan.stops.length > 0 ? await resolveDriveLegs(dayPlan, actor.companyId) : { legs: {}, totals: {} };
      const members = await prisma.user.findMany({ where: { companyId: actor.companyId, isActive: true }, select: { id: true, name: true } });
      const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? id;
      return {
        date: date.toISOString().slice(0, 10),
        routingEnabled: dayPlan.enabled,
        start: dayPlan.start?.label ?? null,
        stops: dayPlan.stops.map((s) => ({
          id: s.id, kind: s.kind, n: s.jobNumber, title: s.title, client: s.contactName, address: s.address,
          when: s.scheduledAt ? fmtWhen(tz, new Date(s.scheduledAt), s.scheduledAnytime) : "unscheduled",
          crew: s.assigneeIds.map(nameOf), mapped: s.lat != null, tentative: s.tentative,
          driveIn: s.assigneeIds.map((u) => drive.legs[u]?.[s.id]).find((v) => v != null) ?? null,
        })),
        driveTotals: Object.fromEntries(Object.entries(drive.totals).map(([u, m]) => [nameOf(u), `~${m} min`])),
      };
    },
  },
  {
    decl: {
      name: "optimize_route",
      description: "Stage re-ordering and re-timing one tech's day by drive time (jobs + confirmed in-person appointments, durations preserved). Managers and office staff can do any tech; techs only themselves. Always call get_route_plan first so you can describe the current order.",
      parameters: {
        type: "object",
        properties: { member: { type: "string", description: "team member id or name" }, date: { type: "string", description: "YYYY-MM-DD" }, anchorTime: { type: "string", description: "HH:mm the day should start (optional)" } },
        required: ["member", "date"],
      },
    },
    allowed: notSales,
    run: async (actor, args, ctx) => {
      const m = await findMember(actor.companyId, str(args.member, 80));
      if (!m) return { error: "No active team member matches that." };
      if (actor.role === "TECH" && m.id !== actor.id) return { error: "Techs can only optimize their own route." };
      const d = day(args.date);
      if (!d) return { error: "date must be YYYY-MM-DD" };
      const anchor = str(args.anchorTime, 5);
      const dateStr = d.toISOString().slice(0, 10);
      return stage(ctx, {
        kind: "optimize_route",
        title: `Optimize ${m.name}'s route for ${dateStr}`,
        lines: ["Reorders and re-times the day's mapped stops by drive time; durations are kept.", ...(anchor ? [`Day starts at ${anchor}`] : []), "Reminders re-send for moved visits."],
        endpoint: "/api/app/route-plan/optimize", method: "POST",
        payload: { userId: m.id, date: dateStr, apply: true, ...(/^\d{2}:\d{2}$/.test(anchor) ? { anchorTime: anchor } : {}) },
        confirmLabel: "Optimize route", href: "/app/schedule/map",
      });
    },
  },
  {
    decl: {
      name: "find_a_time",
      description: "Drive-time-aware open slots for one tech on a date (the app's Find a Time). Use before schedule_appointment / update_job when the user asks when someone is free or what fits the route.",
      parameters: {
        type: "object",
        properties: { member: { type: "string", description: "team member id or name (default: the current user)" }, date: { type: "string", description: "YYYY-MM-DD" }, durationMinutes: { type: "integer" }, address: { type: "string", description: "where the new visit is" } },
        required: ["date"],
      },
    },
    allowed: () => true,
    run: async (actor, args) => {
      const tz = await companyTz(actor.companyId);
      const memberArg = str(args.member, 80);
      const m = memberArg ? await findMember(actor.companyId, memberArg) : { id: actor.id, name: actor.name };
      if (!m) return { error: "No active team member matches that." };
      if (m.id !== actor.id && !isManager(actor.role) && actor.role !== "USER") return { error: "You can only look up your own availability." };
      const d = day(args.date);
      if (!d) return { error: "date must be YYYY-MM-DD" };
      const result = await suggestTimes(actor, { date: parseRouteDate(d.toISOString().slice(0, 10), tz), userId: m.id, durationMinutes: num(args.durationMinutes) ?? undefined, address: str(args.address, 300) || null });
      return {
        for: m.name, driveAware: result.driveAware,
        suggestions: result.suggestions.map((s) => ({ start: fmtWhen(tz, new Date(s.start), false), startIso: s.start, end: fmtWhen(tz, new Date(s.end), false), after: s.prevTitle, before: s.nextTitle, addedDrive: s.totalDriveMinutes != null ? `~${s.totalDriveMinutes} min` : null })),
        note: result.suggestions.length === 0 ? "No open slot that day within working hours." : undefined,
      };
    },
  },
  {
    decl: {
      name: "post_team_message",
      description: "Stage posting a message in team chat — the whole company channel by default, or a direct message / group by channel id (action list shows channels). Pushes to the other members.",
      parameters: {
        type: "object",
        properties: { action: { type: "string", enum: ["list", "post"] }, body: { type: "string" }, channelId: { type: "string", description: "omit for the everyone channel" } },
        required: ["action"],
      },
    },
    allowed: () => true,
    run: async (actor, args, ctx) => {
      if (str(args.action, 4) === "list") {
        const channels = await prisma.chatChannel.findMany({
          where: { companyId: actor.companyId, OR: [{ isEveryone: true }, { members: { some: { userId: actor.id } } }] },
          orderBy: { lastMessageAt: "desc" }, take: 30,
          select: { id: true, isEveryone: true, name: true, members: { select: { user: { select: { name: true } } } } },
        });
        return { channels: channels.map((c) => ({ id: c.id, kind: c.isEveryone ? "everyone" : c.members.length === 2 ? "dm" : "group", name: c.isEveryone ? "Everyone" : c.name || c.members.map((mm) => mm.user.name).filter((nn) => nn !== actor.name).join(", ") })) };
      }
      const body = str(args.body, 4000);
      if (!body) return { error: "body is required." };
      const channelId = str(args.channelId, 40);
      let label = "Everyone";
      if (channelId) {
        const c = await prisma.chatChannel.findFirst({ where: { id: channelId, companyId: actor.companyId, OR: [{ isEveryone: true }, { members: { some: { userId: actor.id } } }] }, select: { isEveryone: true, name: true, members: { select: { user: { select: { name: true } } } } } });
        if (!c) return { error: "No channel with that id you're a member of." };
        label = c.isEveryone ? "Everyone" : c.name || c.members.map((mm) => mm.user.name).filter((nn) => nn !== actor.name).join(", ");
      }
      return stage(ctx, {
        kind: "post_team_message",
        title: `Post in team chat → ${label}`,
        lines: [body.length > 200 ? `${body.slice(0, 200)}…` : body],
        endpoint: "/api/app/chat", method: "POST", payload: { body, ...(channelId ? { channel: channelId } : {}) },
        confirmLabel: "Post message", href: "/app/chat",
      });
    },
  },
];
