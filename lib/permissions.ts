import { cache } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

/**
 * Per-request memo of the NextAuth session. The platform layout, the page,
 * and any nested server component all ask for it; without the memo each one
 * re-reads the cookie and re-decrypts the JWT.
 */
export const getSession = cache(() => getServerSession(authOptions));

/**
 * Role-based permissions.
 *
 * OWNER  — everything, including team management and owners/admins.
 * ADMIN  — everything except managing owners/admins.
 * USER   — sales + tech combined ("Sales + Tech" in the UI): full job board,
 *          invoices/payments, but only their assigned leads; no settings/team.
 * SALES  — assigned leads + their requests/quotes/jobs; invoices & payments
 *          only when the company's salesSeePayments toggle is on.
 * TECH   — jobs assigned to them + schedule; sees client contact info on
 *          their jobs but no pricing anywhere.
 *
 * Lead ownership lives on Contact.assignedToId; requests/quotes/invoices
 * inherit visibility through their contact.
 */

export type Role = "SUPERADMIN" | "OWNER" | "ADMIN" | "USER" | "SALES" | "TECH";

export type Actor = {
  id: string;
  name: string;
  role: Role;
  companyId: string;
  salesSeePayments: boolean;
};

export const roleLabel: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  USER: "Sales + Tech",
  SALES: "Sales",
  TECH: "Tech",
  SUPERADMIN: "Superadmin",
};

// Assignable when adding/editing team members (SUPERADMIN is internal)
export const assignableRoles: Role[] = ["OWNER", "ADMIN", "USER", "SALES", "TECH"];

/**
 * The session JWT only refreshes at sign-in, so role changes, deactivation,
 * and platform suspension must be enforced from the DB. Every /api/app route
 * and platform page goes through this — one indexed lookup per request.
 */
type LoadedActor = {
  actor: Actor | null;
  suspended: boolean;
  stale: boolean;
  /** The raw user row (even when inactive) — the layout's shell chrome
   *  reads name/role/tour state from it without a second lookup. */
  user: { name: string; role: string; tourCompletedAt: Date | null } | null;
};

// React cache(): memoised per request, so the layout, the page, and every
// nested server component that calls getActor/requirePageActor share ONE
// session decode and ONE user lookup instead of repeating both.
const loadActor = cache(async (): Promise<LoadedActor> => {
  const session = await getSession();
  if (!session?.user?.id) return { actor: null, suspended: false, stale: false, user: null };
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      role: true,
      companyId: true,
      isActive: true,
      tourCompletedAt: true,
      company: { select: { salesSeePayments: true, suspendedAt: true } },
    },
  });
  // stale = the JWT points at a User that no longer exists (deleted from the
  // superadmin console) — the cookie itself is the problem, not the account.
  if (!user) return { actor: null, suspended: false, stale: true, user: null };
  const raw = { name: user.name, role: user.role, tourCompletedAt: user.tourCompletedAt };
  if (!user.isActive || !user.companyId) {
    return { actor: null, suspended: false, stale: false, user: raw };
  }
  return {
    actor: {
      id: user.id,
      name: user.name,
      role: user.role as Role,
      companyId: user.companyId,
      salesSeePayments: user.company?.salesSeePayments ?? true,
    },
    suspended: Boolean(user.company?.suspendedAt),
    stale: false,
    user: raw,
  };
});

/** Layout-side read: the memoised actor load with no redirect side effects. */
export function peekActor(): Promise<LoadedActor> {
  return loadActor();
}

/** Suspended companies get null everywhere — every /api/app route dies 401. */
export async function getActor(): Promise<Actor | null> {
  const { actor, suspended } = await loadActor();
  return suspended ? null : actor;
}

/**
 * Page-side variant: redirects instead of returning null. Pages that a role
 * shouldn't see bounce to the dashboard (which every role can open);
 * suspended companies land on the contact-support page.
 */
export async function requirePageActor(allowed?: (a: Actor) => boolean): Promise<Actor> {
  const { actor, suspended, stale } = await loadActor();
  if (suspended) redirect("/app/suspended");
  // A deleted user's session can't be fixed by register (attach mode hides
  // the fields the server would demand) — clear the dead cookie instead.
  if (stale) redirect("/api/app/session-reset");
  if (!actor) {
    const session = await getSession();
    redirect(session ? "/app/register" : "/app/login");
  }
  if (allowed && !allowed(actor)) redirect("/app/dashboard");
  return actor;
}

// ── Capability checks ────────────────────────────────────────────────────────

/** Full visibility + settings + team management. */
export function isManager(role: Role): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/** May work the sales pipeline (contacts, requests, quotes). */
export function canSell(role: Role): boolean {
  return isManager(role) || role === "USER" || role === "SALES";
}

/** May see invoices, payments, and money totals. */
export function canSeeMoney(actor: Actor): boolean {
  if (isManager(actor.role) || actor.role === "USER") return true;
  return actor.role === "SALES" && actor.salesSeePayments;
}

/** May see line-item pricing (everyone but techs). */
export function canSeePricing(role: Role): boolean {
  return role !== "TECH";
}

/** Sees every lead in the company (vs only assigned ones). */
export function seesAllLeads(role: Role): boolean {
  return isManager(role);
}

// ── Prisma where-clause scopes (spread into queries) ────────────────────────

/** Contacts the actor may see/touch. */
export function contactScope(actor: Actor): Record<string, unknown> {
  if (seesAllLeads(actor.role)) return {};
  return { assignedToId: actor.id };
}

/** Requests/quotes/invoices — visibility inherited from their contact. */
export function viaContactScope(actor: Actor): Record<string, unknown> {
  if (seesAllLeads(actor.role)) return {};
  return { contact: { assignedToId: actor.id } };
}

/** Jobs: managers + USER see all, techs their assignments, sales their leads'. */
export function jobScope(actor: Actor): Record<string, unknown> {
  if (isManager(actor.role) || actor.role === "USER") return {};
  if (actor.role === "TECH") return { assignments: { some: { userId: actor.id } } };
  return { contact: { assignedToId: actor.id } };
}

/**
 * Appointments (sales meetings/estimates): managers see all; sales/USER see
 * their leads' appointments plus any assigned directly to them. Techs none.
 */
export function appointmentScope(actor: Actor): Record<string, unknown> {
  if (isManager(actor.role)) return {};
  return {
    OR: [{ contact: { assignedToId: actor.id } }, { assignedToId: actor.id }],
  };
}

// ── Team management rules ────────────────────────────────────────────────────

/** Which roles this actor may create or modify. */
export function canManageRole(actorRole: Role, targetRole: Role): boolean {
  if (actorRole === "OWNER") return targetRole !== "SUPERADMIN";
  if (actorRole === "ADMIN") return targetRole === "USER" || targetRole === "SALES" || targetRole === "TECH";
  return false;
}

/** The company owner who receives website leads when no preset is set. */
export async function defaultLeadAssignee(companyId: string): Promise<string | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { defaultLeadUserId: true },
  });
  if (company?.defaultLeadUserId) {
    // make sure the preset user is still active
    const preset = await prisma.user.findFirst({
      where: { id: company.defaultLeadUserId, companyId, isActive: true },
      select: { id: true },
    });
    if (preset) return preset.id;
  }
  const owner = await prisma.user.findFirst({
    where: { companyId, role: "OWNER", isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return owner?.id ?? null;
}
