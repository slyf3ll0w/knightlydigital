import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSeeMoney } from "@/lib/permissions";
import { getProcessor } from "@/lib/payments";
import { buildPaymentsReport, isReportPeriod, lastPeriods, REPORT_PERIOD_COUNT, reportCsv, reportCsvFilename } from "@/lib/payments-reports";
import { zonedMidnight } from "@/lib/timezone";
import { loadReportRows } from "@/app/platform/payments/square/data";

/**
 * GET /api/app/payments/reports?period=day|week|month&from=YYYY-MM-DD&format=csv
 * Money in for the last 12 periods ending with the one containing `from`
 * (default: today), in the company's timezone: totals per period, by tech,
 * by job type. Rows = every WorkBench payment plus, for a Square-connected
 * company, the seller's Square sales taken outside WorkBench (best effort —
 * `squareIncluded: false` when Square couldn't be read). `format=csv`
 * downloads the same report.
 */
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const periodRaw = sp.get("period") ?? "month";
  if (!isReportPeriod(periodRaw)) return NextResponse.json({ error: "period must be day, week or month." }, { status: 400 });
  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { timezone: true, squareMerchantId: true, squareConnectedAt: true },
  });
  const tz = company?.timezone ?? "America/Chicago";

  let anchor = new Date();
  const fromRaw = sp.get("from");
  if (fromRaw) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fromRaw);
    if (!m) return NextResponse.json({ error: "from must be YYYY-MM-DD." }, { status: 400 });
    anchor = zonedMidnight(tz, Number(m[1]), Number(m[2]), Number(m[3]));
    if (Number.isNaN(anchor.getTime())) return NextResponse.json({ error: "from must be a real date." }, { status: 400 });
  }

  const periods = lastPeriods(tz, periodRaw, REPORT_PERIOD_COUNT, anchor);
  const from = periods[0].start;
  const to = periods[periods.length - 1].end;
  const squareConnected = getProcessor().name === "square" && Boolean(company?.squareMerchantId && company?.squareConnectedAt);
  const { rows, square } = await loadReportRows(
    actor.companyId,
    from,
    to,
    // Not on Square: skip the seller read entirely (an empty, successful window)
    squareConnected ? undefined : { payments: [], byId: new Map(), outside: [], truncated: false, failure: null }
  );
  const report = buildPaymentsReport(rows, { tz, period: periodRaw, anchor, count: REPORT_PERIOD_COUNT });

  if (sp.get("format") === "csv") {
    return new Response(reportCsv(report), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${reportCsvFilename(report)}"`,
        "Cache-Control": "no-store",
      },
    });
  }
  return NextResponse.json({
    ...report,
    squareIncluded: squareConnected && square.failure === null,
    squareTruncated: square.truncated,
  });
}
