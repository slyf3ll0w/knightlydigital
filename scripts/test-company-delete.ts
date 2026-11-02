/**
 * Every company-owned model is deletable with the company (lib/company-delete.ts).
 * Reads the Prisma schema's DMMF: a model with a `companyId` field must either
 * cascade from Company (relation onDelete: Cascade) or appear in
 * COMPANY_DELETE_ORDER, or be a deliberate keep. Fails when someone adds a
 * model and forgets — the readiness review found 34 such relations.
 *   npx tsx scripts/test-company-delete.ts
 */
process.env.DATABASE_URL ??= "postgresql://u:p@localhost:5432/unused";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";

async function main() {
  const { COMPANY_DELETE_ORDER, COMPANY_DELETE_KEEPS } = await import("../lib/company-delete");
  const order = new Set<string>(COMPANY_DELETE_ORDER);
  const keeps = new Set<string>(COMPANY_DELETE_KEEPS);
  const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
  const problems: string[] = [];
  let covered = 0;
  for (const model of Prisma.dmmf.datamodel.models) {
    if (model.name === "Company") continue;
    const hasCompanyId = model.fields.some((f) => f.name === "companyId" && f.kind === "scalar");
    if (!hasCompanyId) continue;
    const rel = model.fields.find((f) => f.kind === "object" && f.type === "Company" && (f.relationFromFields ?? []).includes("companyId"));
    const cascades = rel?.relationOnDelete === "Cascade";
    const listed = order.has(lower(model.name));
    const kept = keeps.has(model.name);
    if (cascades || listed || kept) covered++;
    else problems.push(`${model.name}: no onDelete: Cascade to Company and not in COMPANY_DELETE_ORDER (or COMPANY_DELETE_KEEPS)`);
    // A listed model must really be a delegate name
    if (listed && !Prisma.dmmf.datamodel.models.some((m) => lower(m.name) === lower(model.name))) problems.push(`${model.name}: not a model`);
  }
  for (const name of order) {
    assert.ok(
      Prisma.dmmf.datamodel.models.some((m) => lower(m.name) === name),
      `COMPANY_DELETE_ORDER names "${name}", which is not a Prisma model`
    );
  }
  assert.deepEqual(problems, [], problems.join("\n"));
  console.log(`company delete: ${covered} company-owned models covered`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
