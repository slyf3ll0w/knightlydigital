import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

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
 * The session JWT only refreshes at sign-in, so role changes and
 * deactivation must be enforced from the DB. Every /api/app route and
 * platform page goes through this — one indexed lookup per request.
 */
export async function getActor(): Promise<Actor | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      role: true,
      companyId: true,
      isActive: true,
      company: { select: { salesSeePayments: true } },
    },
  });
  if (!user || !user.isActive || !user.companyId) return null;
  return {
    id: user.id,
    name: user.name,
    role: user.role as Role,
    companyId: user.companyId,
    salesSeePayments: user.company?.salesSeePayments ?? true,
  };
}

/**
 * Page-side variant: redirects instead of returning null. Pages that a role
 * shouldn't see bounce to the dashboard (which every role can open).
 */
export async function requirePageActor(allowed?: (a: Actor) => boolean): Promise<Actor> {
  const actor = await getActor();
  if (!actor) {
    const session = await getServerSession(authOptions);
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
