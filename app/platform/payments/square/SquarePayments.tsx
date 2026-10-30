import KpiStrip from "@/components/KpiStrip";
import { isManager, type Actor } from "@/lib/permissions";
import { money } from "@/lib/statuses";
import { startOfMonthIn, zonedParts } from "@/lib/timezone";
import { buildPaymentsReport, isReportPeriod, lastPeriods, REPORT_PERIOD_COUNT, summarize, type ReportPeriod } from "@/lib/payments-reports";
import { listSquareDisputes, listSquarePayouts, UNRESOLVED_DISPUTE_STATES, type SellerDispute, type SellerPayout, type SellerReadFailure } from "@/lib/square-seller-reports";
import { ReconnectCard, SquareLinkRows, SquareTabs, parseSquareTab, RuledLabel } from "./bits";
import { loadReportRows, loadSquareWindow } from "./data";
import PaymentsTab from "./PaymentsTab";
import PayoutsTab from "./PayoutsTab";
import DisputesTab from "./DisputesTab";
import ReportsTab from "./ReportsTab";
import GiftCardsTab from "./GiftCardsTab";
import LoyaltyTab from "./LoyaltyTab";
import TransactionDetail from "./TransactionDetail";

/** How far back the Payments tab lists Square sales taken outside WorkBench. */
const OUTSIDE_WINDOW_DAYS = 90;

/**
 * The Square-connected company's money view: the Square dashboard's
 * capabilities in WorkBench's shape (2026-10-28; gift cards, loyalty and the
 * transaction detail 2026-10-30). KPI strip (collected and fees this month,
 * on its way to the bank, open disputes), then one of six tabs — Payments ·
 * Payouts · Disputes · Reports · Gift cards · Loyalty — each its own screen
 * on a phone. Every Square number is read live with the seller's token and
 * tolerated to fail on its own; our own records always render.
 */
export default async function SquarePayments({
  actor,
  tz,
  sandbox,
  missingScopes,
  isOwner,
  params,
}: {
  actor: Actor;
  tz: string;
  sandbox: boolean;
  /** Scopes the stored grant lacks (SquareStatus.missingScopes). */
  missingScopes: string[];
  isOwner: boolean;
  params: { tab?: string; page?: string; payout?: string; dispute?: string; period?: string; payment?: string; giftcard?: string; cursor?: string };
}) {
  const companyId = actor.companyId;
  const tab = parseSquareTab(params.tab);
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const period: ReportPeriod = isReportPeriod(params.period) ? params.period : "month";
  const now = new Date();
  const monthStart = startOfMonthIn(tz, now);
  const needPayouts = !missingScopes.includes("PAYOUTS_READ");
  const needDisputes = !missingScopes.includes("DISPUTES_READ");
  const manager = isManager(actor.role);

  // The month window feeds the KPIs on every tab; the Payments tab's 90-day
  // window and the Reports range are wider, so each loads its own.
  const [monthLoad, payoutsRead, disputesRead] = await Promise.all([
    loadReportRows(companyId, monthStart, now),
    needPayouts ? listSquarePayouts(companyId, { beginTime: new Date(now.getTime() - 365 * 86_400_000) }) : Promise.resolve(null),
    needDisputes ? listSquareDisputes(companyId) : Promise.resolve(null),
  ]);
  const month = summarize(monthLoad.rows);
  const payouts: SellerPayout[] = payoutsRead?.ok ? payoutsRead.data.payouts : [];
  const payoutsFailure: SellerReadFailure | null = payoutsRead
    ? payoutsRead.ok
      ? null
      : payoutsRead
    : { ok: false, transient: false, missingScopes: true, notConnected: false, message: "Reconnect Square to see payouts." };
  const disputes: SellerDispute[] = disputesRead?.ok ? disputesRead.data.disputes : [];
  const disputesFailure: SellerReadFailure | null = disputesRead
    ? disputesRead.ok
      ? null
      : disputesRead
    : { ok: false, transient: false, missingScopes: true, notConnected: false, message: "Reconnect Square to see disputes." };
  const onTheWay = payouts.filter((p) => p.status === "SENT").reduce((s, p) => s + p.amountCents, 0);
  const openDisputes = disputes.filter((d) => UNRESOLVED_DISPUTE_STATES.has(d.state)).length;
  // Any scope the grant lacks → one Reconnect card on the Payments tab; the
  // other tabs show it in place of their own content.
  const needsReconnect = missingScopes.length > 0;
  const whatIsMissing = [
    !needPayouts || !needDisputes ? "payouts and disputes" : "",
    missingScopes.includes("ORDERS_READ") ? "the items behind a sale" : "",
    missingScopes.some((s) => s.startsWith("GIFTCARDS")) ? "gift cards" : "",
    missingScopes.some((s) => s.startsWith("LOYALTY")) ? "loyalty" : "",
  ].filter(Boolean);

  // Day-by-day bars for the "Collected" card, like the dashboard's
  const daily = Array.from({ length: zonedParts(tz, now).d }, () => 0);
  for (const r of monthLoad.rows) {
    const idx = zonedParts(tz, r.paidAt).d - 1;
    if (idx >= 0 && idx < daily.length) daily[idx] += (r.amountCents + r.refundedCents) / 100;
  }

  const kpis = [
    {
      label: "Collected",
      value: money(month.collectedCents / 100),
      sub: `this month · ${month.count} ${month.count === 1 ? "payment" : "payments"}`,
      zero: month.collectedCents === 0,
      spark: month.collectedCents > 0 ? daily : undefined,
      href: "/app/payments?tab=reports",
    },
    {
      label: "Processing fees",
      mobileLabel: "Fees",
      value: month.feesCents > 0 ? money(month.feesCents / 100) : "—",
      sub: "this month, kept by Square",
      zero: month.feesCents === 0,
      href: "/app/payments?tab=reports",
    },
    {
      label: "On its way to your bank",
      mobileLabel: "To bank",
      value: payoutsFailure?.missingScopes ? "Reconnect" : onTheWay > 0 ? money(onTheWay / 100) : "—",
      sub: payoutsFailure?.missingScopes ? "Reconnect Square to see payouts" : payoutsFailure ? "Square didn't answer" : "payouts Square has sent, not yet posted",
      zero: onTheWay === 0 && !payoutsFailure?.missingScopes,
      href: "/app/payments?tab=payouts",
    },
    {
      label: "Open disputes",
      mobileLabel: "Disputes",
      value: disputesFailure?.missingScopes ? "Reconnect" : String(openDisputes),
      sub: disputesFailure?.missingScopes ? "Reconnect Square to see disputes" : openDisputes > 0 ? "a client's bank questioned a charge" : "none open",
      zero: openDisputes === 0 && !disputesFailure?.missingScopes,
      tone: openDisputes > 0 ? ("danger" as const) : undefined,
      href: "/app/payments?tab=disputes",
    },
  ];

  let body: React.ReactNode;
  if (tab === "payouts") {
    body = (
      <PayoutsTab
        companyId={companyId}
        tz={tz}
        payouts={payouts}
        failure={payoutsFailure}
        payoutId={params.payout ?? null}
        sandbox={sandbox}
        canReconnect={isOwner}
      />
    );
  } else if (tab === "disputes") {
    body = (
      <DisputesTab
        companyId={companyId}
        tz={tz}
        disputes={disputes}
        failure={disputesFailure}
        disputeId={params.dispute ?? null}
        canAct={manager}
        sandbox={sandbox}
        canReconnect={isOwner}
      />
    );
  } else if (tab === "reports") {
    const periods = lastPeriods(tz, period, REPORT_PERIOD_COUNT, now);
    const { rows, square } = await loadReportRows(companyId, periods[0].start, periods[periods.length - 1].end);
    const report = buildPaymentsReport(rows, { tz, period, anchor: now });
    body = <ReportsTab report={report} squareFailure={square.failure} squareTruncated={square.truncated} />;
  } else if (tab === "giftcards") {
    body = (
      <GiftCardsTab
        companyId={companyId}
        tz={tz}
        giftCardId={params.giftcard ?? null}
        cursor={params.cursor ?? null}
        canSell={manager}
        canReconnect={isOwner}
        missingScope={missingScopes.some((s) => s.startsWith("GIFTCARDS"))}
      />
    );
  } else if (tab === "loyalty") {
    body = (
      <LoyaltyTab
        companyId={companyId}
        sandbox={sandbox}
        cursor={params.cursor ?? null}
        canManage={manager}
        canReconnect={isOwner}
        missingScope={missingScopes.some((s) => s.startsWith("LOYALTY"))}
      />
    );
  } else if (params.payment) {
    body = <TransactionDetail companyId={companyId} tz={tz} paymentId={params.payment} canReconnect={isOwner} />;
  } else {
    const from = new Date(now.getTime() - OUTSIDE_WINDOW_DAYS * 86_400_000);
    const win = await loadSquareWindow(companyId, from, now);
    body = <PaymentsTab companyId={companyId} actor={actor} tz={tz} page={page} window={win} windowDays={OUTSIDE_WINDOW_DAYS} />;
  }

  return (
    <>
      {needsReconnect && tab === "payments" && !params.payment && (
        <ReconnectCard what={whatIsMissing.join(", ") || "everything Square reports"} canReconnect={isOwner} />
      )}
      <KpiStrip desktopCols={4} kpis={kpis} />
      <SquareTabs tab={tab} openDisputes={openDisputes} />
      {body}
      {tab === "payments" && !params.payment && (
        <div className="mb-8">
          <RuledLabel info="Products and settings that belong to your Square account rather than to WorkBench — they open in Square's dashboard with the same sign-in. Gift cards and loyalty have their own tabs here now.">
            In Square
          </RuledLabel>
          <SquareLinkRows
            sandbox={sandbox}
            rows={[
              { screen: "transactions", title: "Transactions in Square", sub: "Square's own list — tap any payment here for the same detail" },
              { screen: "onlineStore", title: "Square Online", sub: "Your online store, if you run one (Square has no API for it)" },
            ]}
          />
        </div>
      )}
    </>
  );
}
