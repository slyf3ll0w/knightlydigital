/**
 * Small RFC-4180-ish CSV parser for the client importer. Handles quoted
 * fields, escaped quotes (""), embedded commas and newlines, CRLF, and a
 * UTF-8 BOM. No dependency needed — spreadsheet exports are tame.
 */

export function parseCsv(text: string): string[][] {
  // strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // drop fully-empty rows (trailing newlines, blank spreadsheet lines)
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Normalize a phone number for duplicate matching: digits only, last 10. */
export function normalizePhone(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/* ------------------------------------------------------------------ */
/* CSV writing (exports)                                               */
/* ------------------------------------------------------------------ */

/** Quote one CSV cell (safe values: dates, numbers we formatted ourselves). */
export const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

/**
 * Same, for cells whose content someone typed into the app.
 *
 * Excel and Sheets evaluate a cell starting with = + - @ (or a tab/CR) as a
 * formula, and quoting doesn't help — the spreadsheet parses after unquoting.
 * So a job titled "=HYPERLINK(...)" runs on whoever opens the export, usually
 * the owner or their accountant. A leading apostrophe forces it to stay text;
 * spreadsheets hide it. Only text columns go through this — a negative amount
 * is a real number, not an injection, and must not be turned into a string.
 */
export const csvText = (v: string) => csvCell(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

/** Assemble header + rows into a downloadable CSV Response. Text columns must
 *  already be run through csvText by the caller (it can't tell which is which). */
export function csvResponse(
  filename: string,
  header: string[],
  rows: string[][]
): Response {
  const csv = [
    header.map(csvCell).join(","),
    ...rows.map((r) => r.join(",")),
  ].join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
