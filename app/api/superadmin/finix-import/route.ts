import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSuperadmin } from "@/lib/superadmin";

/**
 * POST — import a Finix Net Profit report CSV (multipart: month + file).
 * One FinixCostSnapshot per merchant per month, upserted so a re-download
 * with corrected dues/assessments simply overwrites. Column names are
 * matched loosely because Finix has renamed report headers before.
 */

/** Minimal CSV parser (quoted fields, commas, CRLF) — the report is small. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** First header whose normalized name contains all the given fragments. */
function findCol(headers: string[], ...fragmentSets: string[][]): number {
  for (const fragments of fragmentSets) {
    const idx = headers.findIndex((h) => fragments.every((f) => norm(h).includes(f)));
    if (idx !== -1) return idx;
  }
  return -1;
}

/** "$1,234.56" / "(12.34)" / "1234.56" → cents. */
function toCents(raw: string | undefined): bigint {
  if (!raw) return BigInt(0);
  const negative = /^\(.*\)$/.test(raw.trim());
  const n = Number(raw.replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(n)) return BigInt(0);
  return BigInt(Math.round(Math.abs(n) * 100) * (negative || n < 0 ? -1 : 1));
}

export async function POST(req: NextRequest) {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const month = form?.get("month");
  const file = form?.get("file");
  if (typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month) || !(file instanceof File)) {
    return NextResponse.json({ error: "Month and CSV file are required." }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large." }, { status: 400 });
  }

  const rows = parseCsv(await file.text());
  if (rows.length < 2) {
    return NextResponse.json({ error: "CSV has no data rows." }, { status: 400 });
  }

  const headers = rows[0];
  const cols = {
    merchant: findCol(headers, ["merchant", "id"]),
    cardSales: findCol(headers, ["card", "sale", "amount"], ["card", "sale"]),
    echeckSales: findCol(headers, ["echeck", "sale"], ["ach", "sale"]),
    cardFees: findCol(headers, ["card", "fees", "amount"], ["card", "fees"]),
    interchange: findCol(headers, ["interchange", "fees"], ["interchange"]),
    residual: findCol(headers, ["residual"]),
  };
  if (cols.merchant === -1) {
    return NextResponse.json(
      { error: `No merchant id column found. Headers: ${headers.join(", ")}` },
      { status: 400 }
    );
  }

  const merchantIds = new Set(
    (
      await prisma.company.findMany({
        where: { finixMerchantId: { not: null } },
        select: { finixMerchantId: true },
      })
    ).map((c) => c.finixMerchantId as string)
  );

  let imported = 0;
  let unmatched = 0;
  for (const row of rows.slice(1)) {
    const merchantId = row[cols.merchant]?.trim();
    if (!merchantId) continue;
    if (!merchantIds.has(merchantId)) unmatched++;
    const data = {
      cardSaleCents: cols.cardSales !== -1 ? toCents(row[cols.cardSales]) : BigInt(0),
      echeckSaleCents: cols.echeckSales !== -1 ? toCents(row[cols.echeckSales]) : BigInt(0),
      cardFeesCents: cols.cardFees !== -1 ? toCents(row[cols.cardFees]) : BigInt(0),
      interchangeFeesCents: cols.interchange !== -1 ? toCents(row[cols.interchange]) : BigInt(0),
      residualCents: cols.residual !== -1 ? toCents(row[cols.residual]) : BigInt(0),
      raw: Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ""])),
    };
    await prisma.finixCostSnapshot.upsert({
      where: { finixMerchantId_month: { finixMerchantId: merchantId, month } },
      create: { finixMerchantId: merchantId, month, ...data },
      update: data,
    });
    imported++;
  }

  return NextResponse.json({ imported, unmatched, month });
}
