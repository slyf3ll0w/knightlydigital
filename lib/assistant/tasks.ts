import { prisma } from "../db";
import { isManager } from "../permissions";
import { listTasks } from "../tasks";
import { type Tool, str, companyTz, findContact, stage } from "./core";

/**
 * Tasks (the /app/tasks list — to-dos with a due date, a reminder, an
 * assignee, optionally pinned to a client or job). Atlas had no way to read
 * or write them until 2026-10-22; "remind me to call Sarah Friday" went
 * nowhere. Reads go straight to lib/tasks.ts; writes stage cards against
 * the same routes the page uses.
 */
export const taskTools: Tool[] = [
  {
    decl: {
      name: "manage_task",
      description:
        "To-do tasks (the Tasks page): reminders, follow-ups, 'call X back', 'order the part'. action 'list' = open tasks (mine; managers may pass team=true for everyone's; done=true for the last 90 days of finished ones). 'create' = stage a task: title, optional notes, dueDate YYYY-MM-DD (+ dueTime HH:MM, company time), priority NORMAL/HIGH, reminder none/at/15m/1h/1d (needs a due time for at/15m/1h), assigneeIds (managers; default = the user), clientId to pin it to a client. 'complete' / 'reopen' / 'update' (title, notes, dueDate, dueTime, priority, assigneeId) / 'delete' take taskId from 'list'. Use this whenever the user wants to remember something, be reminded, or hand a to-do to a teammate.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list", "create", "complete", "reopen", "update", "delete"] },
          taskId: { type: "string" },
          team: { type: "boolean", description: "list: everyone's tasks (managers)" },
          done: { type: "boolean", description: "list: finished tasks instead of open ones" },
          title: { type: "string" },
          notes: { type: "string" },
          dueDate: { type: "string", description: "YYYY-MM-DD" },
          dueTime: { type: "string", description: "HH:MM 24h, company time; omit for an all-day task" },
          priority: { type: "string", enum: ["NORMAL", "HIGH"] },
          reminder: { type: "string", enum: ["none", "at", "15m", "1h", "1d"] },
          assigneeIds: { type: "array", items: { type: "string" }, description: "create: team member ids (list_team)" },
          assigneeId: { type: "string", description: "update: hand the task to this team member" },
          clientId: { type: "string", description: "create: pin the task to this client" },
        },
        required: ["action"],
      },
    },
    allowed: () => true,
    run: async (actor, args, ctx) => {
      const action = str(args.action, 10);
      const tz = await companyTz(actor.companyId);

      if (action === "list") {
        const team = args.team === true && isManager(actor.role);
        const done = args.done === true;
        const view = team ? (done ? "team_done" : "team") : done ? "done" : "mine";
        const tasks = await listTasks(actor, view, tz);
        return {
          view,
          count: tasks.length,
          tasks: tasks.slice(0, 80).map((t) => ({
            id: t.id,
            title: t.title,
            ...(t.notes ? { notes: t.notes.length > 160 ? `${t.notes.slice(0, 160)}…` : t.notes } : {}),
            due: t.dueDate ? (t.allDay ? t.dueDate : `${t.dueDate} ${t.dueTime}`) : null,
            priority: t.priority,
            reminder: t.reminder,
            assignee: t.assigneeName,
            ...(t.doneAt ? { doneAt: t.doneAt } : {}),
            ...(t.contactId ? { clientId: t.contactId } : {}),
            ...(t.jobId ? { jobId: t.jobId } : {}),
          })),
          ...(tasks.length > 80 ? { note: `${tasks.length - 80} more not shown` } : {}),
        };
      }

      if (action === "create") {
        const title = str(args.title, 160);
        if (!title) return { error: "title is required" };
        const payload: Record<string, unknown> = { title };
        const lines: string[] = [];
        const notes = str(args.notes, 2000);
        if (notes) payload.notes = notes;
        const dueDate = str(args.dueDate, 10);
        const dueTime = str(args.dueTime, 5);
        if (dueDate) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { error: "dueDate must be YYYY-MM-DD" };
          payload.dueDate = dueDate;
          if (dueTime) {
            if (!/^\d{2}:\d{2}$/.test(dueTime)) return { error: "dueTime must be HH:MM (24h)" };
            payload.dueTime = dueTime;
          }
          lines.push(`Due: ${dueDate}${dueTime ? ` ${dueTime}` : ""}`);
        } else if (dueTime) {
          return { error: "dueTime needs a dueDate" };
        }
        const priority = str(args.priority, 8);
        if (priority === "HIGH") {
          payload.priority = "HIGH";
          lines.push("Priority: high");
        }
        const reminder = str(args.reminder, 6);
        if (reminder && reminder !== "none") {
          if (!["at", "15m", "1h", "1d"].includes(reminder)) return { error: "reminder must be none, at, 15m, 1h or 1d" };
          if (!dueDate) return { error: "A reminder needs a due date." };
          if (reminder !== "1d" && !dueTime) return { error: `Reminder '${reminder}' needs a due time; all-day tasks can only remind 1d ahead.` };
          payload.reminder = reminder;
          lines.push(`Reminder: ${reminder === "at" ? "at the due time" : `${reminder} before`}`);
        }
        const assigneeIds = (Array.isArray(args.assigneeIds) ? args.assigneeIds : [])
          .map((v) => str(v, 40))
          .filter(Boolean)
          .slice(0, 20);
        if (assigneeIds.length > 0) {
          if (!isManager(actor.role)) return { error: "Only managers can hand tasks to other people — leave assigneeIds out." };
          const members = await prisma.user.findMany({
            where: { id: { in: assigneeIds }, companyId: actor.companyId, isActive: true },
            select: { id: true, name: true },
          });
          if (members.length !== assigneeIds.length) return { error: "One or more assigneeIds aren't active team members — check list_team." };
          payload.assigneeIds = members.map((m) => m.id);
          lines.push(`For: ${members.map((m) => m.name).join(", ")}`);
        }
        const clientId = str(args.clientId, 40);
        if (clientId) {
          const contact = await findContact(actor, clientId);
          if (!contact) return { error: "No client with that id." };
          payload.contactId = contact.id;
          lines.push(`Client: ${contact.firstName} ${contact.lastName}`.trim());
        }
        return stage(ctx, {
          kind: "create_task",
          title: `Add task: ${title}`,
          lines,
          endpoint: "/api/app/tasks",
          method: "POST",
          payload,
          confirmLabel: "Add task",
          href: "/app/tasks",
        });
      }

      // Everything else needs an existing task the user can see.
      const taskId = str(args.taskId, 40);
      if (!taskId) return { error: "taskId is required — use action 'list' first." };
      const task = await prisma.task.findFirst({
        where: {
          id: taskId,
          companyId: actor.companyId,
          ...(isManager(actor.role) ? {} : { OR: [{ assigneeId: actor.id }, { createdById: actor.id }] }),
        },
        select: { id: true, title: true, doneAt: true, assigneeId: true },
      });
      if (!task) return { error: "No task with that id (or not yours to change)." };

      if (action === "complete" || action === "reopen") {
        const done = action === "complete";
        if (done === Boolean(task.doneAt)) return { error: done ? "Already done." : "It's already open." };
        return stage(ctx, {
          kind: done ? "complete_task" : "reopen_task",
          title: `${done ? "Mark done" : "Reopen"}: ${task.title}`,
          lines: [],
          endpoint: `/api/app/tasks/${task.id}`,
          method: "PATCH",
          payload: { done },
          confirmLabel: done ? "Mark done" : "Reopen",
        });
      }

      if (action === "update") {
        const payload: Record<string, unknown> = {};
        const lines: string[] = [];
        const title = str(args.title, 160);
        if (title) {
          payload.title = title;
          lines.push(`Title: ${title}`);
        }
        if (args.notes !== undefined) {
          payload.notes = str(args.notes, 2000);
          lines.push(payload.notes ? `Notes: ${String(payload.notes).slice(0, 120)}` : "Notes cleared");
        }
        const dueDate = str(args.dueDate, 10);
        const dueTime = str(args.dueTime, 5);
        if (dueDate || dueTime) {
          if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { error: "dueDate must be YYYY-MM-DD" };
          if (dueTime && !/^\d{2}:\d{2}$/.test(dueTime)) return { error: "dueTime must be HH:MM (24h)" };
          if (!dueDate) return { error: "Send dueDate along with dueTime." };
          payload.dueDate = dueDate;
          payload.dueTime = dueTime || "";
          lines.push(`Due: ${dueDate}${dueTime ? ` ${dueTime}` : ""}`);
        }
        const priority = str(args.priority, 8);
        if (priority === "HIGH" || priority === "NORMAL") {
          payload.priority = priority;
          lines.push(`Priority: ${priority.toLowerCase()}`);
        }
        const assigneeId = str(args.assigneeId, 40);
        if (assigneeId && assigneeId !== task.assigneeId) {
          if (!isManager(actor.role)) return { error: "Only managers can reassign tasks." };
          const member = await prisma.user.findFirst({
            where: { id: assigneeId, companyId: actor.companyId, isActive: true },
            select: { id: true, name: true },
          });
          if (!member) return { error: "No active team member with that id — check list_team." };
          payload.assigneeId = member.id;
          lines.push(`Hand to: ${member.name}`);
        }
        if (lines.length === 0) return { error: "Nothing to change." };
        return stage(ctx, {
          kind: "update_task",
          title: `Update task: ${task.title}`,
          lines,
          endpoint: `/api/app/tasks/${task.id}`,
          method: "PATCH",
          payload,
          confirmLabel: "Save changes",
        });
      }

      if (action === "delete") {
        return stage(ctx, {
          kind: "delete_task",
          title: `Delete task: ${task.title}`,
          lines: ["Gone for good — mark it done instead if it happened."],
          endpoint: `/api/app/tasks/${task.id}`,
          method: "DELETE",
          payload: {},
          danger: true,
          confirmLabel: "Delete task",
        });
      }

      return { error: "action must be list, create, complete, reopen, update, or delete" };
    },
  },
];
