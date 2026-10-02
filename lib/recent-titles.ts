import { prisma } from "./db";

/**
 * The titles a person typed themselves (appointment purposes, job titles),
 * newest first, kept on their User row so the New Appointment / New Job
 * forms can start from the last one and offer the rest as suggestions.
 * Only titles someone actually typed are remembered — never the defaults
 * ("Estimate", the service names) a blank box falls back to.
 */
export type TitleKind = "appointment" | "job";
export type RecentTitles = Record<TitleKind, string[]>;

const KEEP = 8;

function clean(raw: unknown): RecentTitles {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const list = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, KEEP) : [];
  return { appointment: list(o.appointment), job: list(o.job) };
}

export async function getRecentTitles(userId: string): Promise<RecentTitles> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { recentTitles: true } });
  return clean(u?.recentTitles);
}

/** Put `title` at the front of the person's list (case-insensitive de-dupe). */
export async function rememberTitle(userId: string, kind: TitleKind, title: unknown): Promise<void> {
  const t = typeof title === "string" ? title.trim().slice(0, 120) : "";
  if (!t) return;
  const cur = await getRecentTitles(userId);
  const next = [t, ...cur[kind].filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, KEEP);
  await prisma.user.update({ where: { id: userId }, data: { recentTitles: { ...cur, [kind]: next } } });
}
