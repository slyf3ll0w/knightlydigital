/**
 * The deploy's schema guard — pure half (scripts/db-push-guarded.ts runs it;
 * scripts/test-schema-guard.ts).
 *
 * Every deploy pushes prisma/schema.prisma to the database. Until
 * 2026-11-16 that was `prisma db push --accept-data-loss` with nothing in
 * front of it: a field renamed or removed in the schema DROPPED the column
 * on production, silently, on the next deploy. The guard reads the SQL the
 * push is about to run and refuses the deploy when any statement destroys
 * data, unless that exact change was approved in prisma/approved-drops.txt
 * within the last APPROVAL_DAYS days.
 *
 * What counts as destroying data: dropping a table, dropping a column,
 * changing a column's type (Postgres casts or fails; removing an enum value
 * is this too) and dropping an enum type. Everything else — new tables,
 * columns, indexes, constraints, defaults — is additive or fails loudly
 * without losing anything.
 */

export const APPROVAL_DAYS = 14;
export const APPROVALS_FILE = "prisma/approved-drops.txt";

/** `"public"."Company"` or `"Company"` → Company */
const NAME = String.raw`(?:"[^"]+"\.)?"([^"]+)"`;

/**
 * The data-destroying changes in a Prisma-generated SQL script, as stable
 * one-line labels: `DROP TABLE "X"`, `DROP COLUMN "X"."y"`,
 * `CHANGE TYPE "X"."y"`, `DROP TYPE "E"`. De-duplicated, in script order.
 */
export function destructiveChanges(sql: string): string[] {
  const found: string[] = [];
  const add = (label: string) => {
    if (!found.includes(label)) found.push(label);
  };
  // Comments first: a `;` or a keyword inside one must not be read as SQL.
  const body = sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  for (const raw of body.split(";")) {
    const stmt = raw.trim();
    if (!stmt) continue;

    const dropTable = stmt.match(new RegExp(String.raw`^DROP TABLE\s+(?:IF EXISTS\s+)?${NAME}`, "i"));
    if (dropTable) {
      add(`DROP TABLE "${dropTable[1]}"`);
      continue;
    }
    const dropType = stmt.match(new RegExp(String.raw`^DROP TYPE\s+(?:IF EXISTS\s+)?${NAME}`, "i"));
    if (dropType) {
      add(`DROP TYPE "${dropType[1]}"`);
      continue;
    }
    const alter = stmt.match(new RegExp(String.raw`^ALTER TABLE\s+(?:ONLY\s+)?${NAME}`, "i"));
    if (alter) {
      const table = alter[1];
      for (const m of stmt.matchAll(/DROP COLUMN\s+(?:IF EXISTS\s+)?"([^"]+)"/gi)) {
        add(`DROP COLUMN "${table}"."${m[1]}"`);
      }
      for (const m of stmt.matchAll(/ALTER COLUMN\s+"([^"]+)"\s+(?:SET DATA\s+)?TYPE\b/gi)) {
        add(`CHANGE TYPE "${table}"."${m[1]}"`);
      }
    }
  }
  return found;
}

export type Approval = { date: string; change: string };

/** Lines of `YYYY-MM-DD <change>`; `#` comments and blank lines ignored. */
export function parseApprovals(text: string): Approval[] {
  const out: Approval[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/);
    if (m) out.push({ date: m[1], change: m[2].trim() });
  }
  return out;
}

/**
 * The changes nobody approved. An approval counts for APPROVAL_DAYS from its
 * date (and not before it), so a line left in the file can't wave through
 * the same drop months later.
 */
export function unapprovedChanges(changes: string[], approvals: Approval[], today: Date): string[] {
  const day = 86_400_000;
  const live = new Set(
    approvals
      .filter((a) => {
        const at = Date.parse(`${a.date}T00:00:00Z`);
        if (Number.isNaN(at)) return false;
        const age = today.getTime() - at;
        return age >= -day && age <= APPROVAL_DAYS * day;
      })
      .map((a) => a.change)
  );
  return changes.filter((c) => !live.has(c));
}
