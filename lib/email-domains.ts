/**
 * Per-company custom sending domains via the Resend Domains API — the rails
 * for "emails come from quotes@summitplumbing.com instead of the platform
 * address". Double-gated:
 *
 * - RESEND_API_KEY   — no key, no Resend at all (same gate as lib/email.ts).
 * - EMAIL_DOMAINS_ENABLED=1 — feature switch. Extra domains need a paid
 *   Resend plan, so the Settings card and API stay invisible until this is
 *   set (and it can later become a per-plan paywall check instead).
 *
 * State lives on Company: emailDomain / emailDomainId / emailDomainStatus /
 * emailDomainRecords / emailFromLocal. lib/email.ts consults it on every
 * companyId-attributed send and only uses the custom address when status is
 * "verified" — every other state falls back to the platform EMAIL_FROM, so a
 * half-verified domain can never bounce a client email.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;

export function emailDomainsEnabled(): boolean {
  return Boolean(RESEND_API_KEY) && process.env.EMAIL_DOMAINS_ENABLED === "1";
}

/** One DNS record Resend wants published (shown verbatim in Settings). */
export type DomainRecord = {
  record: string; // "SPF" | "DKIM" | ...
  name: string;
  type: string; // "TXT" | "CNAME" | "MX"
  value: string;
  ttl?: string;
  priority?: number;
  status?: string;
};

export type ResendDomain = {
  id: string;
  name: string;
  status: string; // "not_started" | "pending" | "verified" | "failure" | "temporary_failure"
  records: DomainRecord[];
};

export class EmailDomainError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "EmailDomainError";
  }
}

async function resend(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message =
      typeof data.message === "string" ? data.message : `Resend request failed (${res.status})`;
    throw new EmailDomainError(message, res.status);
  }
  return data;
}

function toDomain(data: Record<string, unknown>): ResendDomain {
  return {
    id: String(data.id ?? ""),
    name: String(data.name ?? ""),
    status: String(data.status ?? "pending"),
    records: Array.isArray(data.records) ? (data.records as DomainRecord[]) : [],
  };
}

/** Register a domain with Resend; returns the DNS records to publish. */
export async function createDomain(name: string): Promise<ResendDomain> {
  return toDomain(await resend("/domains", { method: "POST", body: JSON.stringify({ name }) }));
}

/** Current status + records (record-level statuses update as DNS propagates). */
export async function getDomain(id: string): Promise<ResendDomain> {
  return toDomain(await resend(`/domains/${id}`));
}

/** Ask Resend to (re)check the DNS records now. */
export async function verifyDomain(id: string): Promise<void> {
  await resend(`/domains/${id}/verify`, { method: "POST" });
}

export async function deleteDomain(id: string): Promise<void> {
  await resend(`/domains/${id}`, { method: "DELETE" });
}

/** Resend's status vocabulary → what we store on Company.emailDomainStatus. */
export function normalizeStatus(status: string): string {
  return status === "verified" ? "verified" : status === "failure" ? "failed" : "pending";
}

const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;
const LOCAL_RE = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;

/** Lowercased/trimmed apex or subdomain, or null if it isn't one. Rejects the
 *  platform's own domain — a tenant must never claim workbenchfsm.com. */
export function sanitizeDomain(input: string): string | null {
  const d = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!DOMAIN_RE.test(d) || d.length > 253) return null;
  if (d === "workbenchfsm.com" || d.endsWith(".workbenchfsm.com")) return null;
  return d;
}

/** Local part for the From address ("quotes" in quotes@domain); null = invalid. */
export function sanitizeLocal(input: string): string | null {
  const l = input.trim().toLowerCase();
  return LOCAL_RE.test(l) ? l : null;
}
