import { prisma } from "@/lib/db";

/**
 * Company-defined custom fields on clients. Values live on
 * Contact.customFields as { [defId]: string } — everything is stored as a
 * string; the def's type drives the input control and validation.
 */

export type ContactFieldDefDTO = {
  id: string;
  label: string;
  type: "TEXT" | "NUMBER" | "DATE" | "SELECT";
  options: string[];
  required: boolean;
  sortOrder: number;
};

export async function getActiveFieldDefs(companyId: string): Promise<ContactFieldDefDTO[]> {
  const defs = await prisma.contactFieldDef.findMany({
    where: { companyId, isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  return defs.map((d) => ({
    id: d.id,
    label: d.label,
    type: d.type,
    options: Array.isArray(d.options) ? (d.options as string[]) : [],
    required: d.required,
    sortOrder: d.sortOrder,
  }));
}

/**
 * Keep only values for active defs, coerce to bounded strings, validate
 * SELECT choices and NUMBER format. Unknown keys are dropped.
 */
export function sanitizeCustomFields(
  raw: unknown,
  defs: ContactFieldDefDTO[]
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  const input = raw as Record<string, unknown>;
  for (const def of defs) {
    const v = input[def.id];
    if (typeof v !== "string") continue;
    const value = v.trim().slice(0, 500);
    if (!value) continue;
    if (def.type === "SELECT" && def.options.length > 0 && !def.options.includes(value)) continue;
    if (def.type === "NUMBER" && Number.isNaN(Number(value))) continue;
    out[def.id] = value;
  }
  return out;
}
