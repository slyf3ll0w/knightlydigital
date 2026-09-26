import type { AutomationSpec, Described, EntityType } from "@/lib/automations";

/** One stored automation as the API / server page hands it to the client. */
export type Row = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  runs: number;
  lastRunAt: string | null;
  updatedAt: string;
  spec: AutomationSpec | null;
  summary: Described | null;
  broken: boolean;
  webhookUrl?: string | null;
};

export type Run = {
  id: string;
  automationId: string;
  event: string;
  entityType: string;
  entityId: string;
  status: string;
  detail: string | null;
  createdAt: string;
};

/** GET /api/app/automations/options — the pickers' choices. */
export type Options = {
  users: { id: string; name: string; role: string }[];
  stages: { id: string; name: string }[];
  customFields: { id: string; label: string; type: string }[];
  agreementTemplates: { id: string; name: string }[];
  emailLive: boolean;
  smsLive: boolean;
  reviewLinkSet: boolean;
  quickbooksConnected: boolean;
  atlasAvailable: boolean;
  timezone: string;
};

export const EMPTY_OPTIONS: Options = {
  users: [], stages: [], customFields: [], agreementTemplates: [],
  emailLive: false, smsLive: false, reviewLinkSet: false, quickbooksConnected: false, atlasAvailable: false, timezone: "America/Chicago",
};

/** POST /api/app/automations/test */
export type TestResult = {
  compiles: boolean;
  errors?: string[];
  summary?: Described;
  preview?: { candidates: number; matches: number; sample: { label: string; href?: string; rendered: { step: number; type: string; text: string }[] }[]; errors: string[] };
  warnings: string[];
};

export type Draft = { name: string; description: string; spec: AutomationSpec; notes: string[] };

export function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function runDot(status: string): string {
  return status === "ok" ? "bg-[color:var(--ds-good)]" : status === "failed" ? "bg-[color:var(--ds-bad)]" : status === "waiting" ? "bg-[color:var(--ds-warn)]" : "bg-[color:var(--ds-faint)]";
}

export const ENTITY_WORD: Partial<Record<EntityType | string, string>> = {
  request: "request", appointment: "appointment", quote: "quote", job: "job", invoice: "invoice", contact: "client",
  payment: "payment", call: "call", contract: "agreement", subscription: "plan", expense: "expense", message: "message",
};
