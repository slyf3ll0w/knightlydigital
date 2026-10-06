/**
 * Task types and constants safe for client components (no Prisma). The
 * server side (lib/tasks.ts) re-exports everything here.
 */

export const TASK_TITLE_MAX = 160;
export const TASK_NOTES_MAX = 2000;

export type TaskBucket = "overdue" | "today" | "tomorrow" | "later" | "none";

export const TASK_BUCKET_ORDER: TaskBucket[] = ["overdue", "today", "tomorrow", "later", "none"];

export const TASK_BUCKET_LABELS: Record<TaskBucket, string> = {
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  later: "Later",
  none: "No date",
};

export type ReminderChoice = "none" | "at" | "15m" | "1h" | "1d" | "custom";

export const REMINDER_CHOICES: { key: ReminderChoice; label: string; minutes: number | null }[] = [
  { key: "none", label: "No reminder", minutes: null },
  { key: "at", label: "At the due time", minutes: 0 },
  { key: "15m", label: "15 minutes before", minutes: 15 },
  { key: "1h", label: "1 hour before", minutes: 60 },
  { key: "1d", label: "1 day before", minutes: 24 * 60 },
  { key: "custom", label: "Pick a time…", minutes: null },
];

export type TaskView = "mine" | "team" | "done";

export type TaskLink = {
  kind: "contact" | "job" | "quote" | "invoice" | "call";
  id: string;
  label: string;
  href: string;
};

export type TaskDTO = {
  id: string;
  title: string;
  notes: string | null;
  dueAt: string | null;
  allDay: boolean;
  /** Editor fields in the company's zone. */
  dueDate: string;
  dueTime: string;
  remindAt: string | null;
  reminder: ReminderChoice;
  /** Editor fields for a custom reminder, company-zone wall clock. */
  remindDate: string;
  remindTime: string;
  priority: "NORMAL" | "HIGH";
  doneAt: string | null;
  assigneeId: string;
  assigneeName: string;
  createdById: string;
  createdByName: string;
  contactId: string | null;
  contactPhone: string | null;
  jobId: string | null;
  quoteId: string | null;
  invoiceId: string | null;
  callId: string | null;
  links: TaskLink[];
  bucket: TaskBucket;
  dueLabel: string | null;
  remindLabel: string | null;
  updatedAt: string;
};

/** Links the editor can be opened with (from a contact / job / call page). */
export type TaskPrefill = {
  title?: string;
  contactId?: string | null;
  jobId?: string | null;
  quoteId?: string | null;
  invoiceId?: string | null;
  callId?: string | null;
  links?: TaskLink[];
};
