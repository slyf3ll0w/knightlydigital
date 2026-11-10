import { isManager, type Actor } from "@/lib/permissions";
import { buildPaymentsReport, isReportPeriod, lastPeriods, REPORT_PERIOD_COUNT, type ReportPeriod } from "@/lib/payments-reports";
import { listSquareDisputes, listSquarePayouts, UNRESOLVED_DISPUTE_STATES, type SellerDispute, type SellerPayout, type SellerReadFailure } from "@/lib/square-seller-reports";
import { ReconnectCard, SquarePhoneLinks, SquareTabs, parseSquareTab } from "./bits";
import { loadReportRows, loadSquareWindow } from "./data";
import PaymentsTab, { parsePaymentsFilter } from "./PaymentsTab";
import Overview, { parseRange, rangeBounds } from "./Overview";
import PayoutsTab from "./PayoutsTab";
import DisputesTab from "./DisputesTab";
import ReportsTab from "./ReportsTab";
import GiftCardsTab from "./GiftCardsTab";
import TransactionDetail from "./TransactionDetail";

/** How far back the Payments tab lists Square sales taken outside WorkBench. */
const OUTSIDE_WINDOW_DAYS = 90;

/**
 * The Square-connected company's money view: the Square dashboard's
 * capabilities in WorkBench's shape (2026-10-28; gift cards and the
 * transaction detail 2026-10-30). KPI strip (collected and fees this month,
 * on its way to the bank, open disputes), then one of five tabs — Payments ·
 * Payouts · Disputes · Reports · Gift cards — each its own screen
 * on a phone. Every Square number is read live with the seller's token and
 * tolerated to fail on its own; our own records always render.
 */
export default async function SquarePayments({
  actor,
  tz,
  sandbox,
  missingScopes,
  unreadable = false,
  isOwner,
  giftCards = false,
  params,
}: {
  actor: Actor;
  tz: string;
  sandbox: boolean;
  /** Scopes the stored grant lacks (SquareStatus.missingScopes). */
  missingScopes: string[];
  /** The saved Square sign-in can't be decrypted (SquareStatus.unreadable) — only a reconnect mends it. */
  unreadable?: boolean;
  isOwner: boolean;
  /** Gift cards are open for this company (lib/gift-cards-preview.ts — test accounts only while suspended). */
  giftCards?: boolean;
  params: { tab?: string; range?: string; show?: string; page?: string; payout?: string; dispute?: string; period?: string; payment?: string; giftcard?: string; cursor?: string; all?: string };
}) {
  const companyId = actor.companyId;
  const parsedTab = parseSquareTab(params.tab);
  // A gift cards link on an account without them lands on Payments
  const tab = parsedTab === "giftcards" && !giftCards ? "payments" : parsedTab;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const period: ReportPeriod = isReportPeriod(params.period) ? params.period : "month";
  const now = new Date();
  const range = parseRange(params.range);
  const filter = parsePaymentsFilter(params.show);
  // What the range chips and filter chips carry from one link to the next.
  const keep = { range: params.range ? range : undefined };
  const listView = tab === "payments" && !params.payment;
  const needPayouts = !missingScopes.includes("PAYOUTS_READ");
  const needDisputes = !missingScopes.includes("DISPUTES_READ");
  const manager = isManager(actor.role);

  // One Square window feeds the overview (this range + the one before it)
  // and the table (at least the last 90 days); payouts and disputes give the
  // two figures beside the chart and the count on the Disputes tab.
  const { prevStart } = rangeBounds(range, tz, now);
  const windowFrom = new Date(Math.min(prevStart.getTime(), now.getTime() - OUTSIDE_WINDOW_DAYS * 86_400_000));
  const [win, payoutsRead, disputesRead] = await Promise.all([
    listView ? loadSquareWindow(companyId, windowFrom, now) : Promise.resolve(null),
    needPayouts && !unreadable ? listSquarePayouts(companyId, { beginTime: new Date(now.getTime() - 365 * 86_400_000) }) : Promise.resolve(null),
    needDisputes && !unreadable ? listSquareDisputes(companyId) : Promise.resolve(null),
  ]);
  const reconnectNote = "Reconnect Square";
  const payouts: SellerPayout[] = payoutsRead?.ok ? payoutsRead.data.payouts : [];
  const payoutsFailure: SellerReadFailure | null = payoutsRead
    ? payoutsRead.ok
      ? null
      : payoutsRead
    : { ok: false, transient: false, missingScopes: true, notConnected: false, message: `${reconnectNote} to see payouts.` };
  const disputes: SellerDispute[] = disputesRead?.ok ? disputesRead.data.disputes : [];
  const disputesFailure: SellerReadFailure | null = disputesRead
    ? disputesRead.ok
      ? null
      : disputesRead
    : { ok: false, transient: false, missingScopes: true, notConnected: false, message: `${reconnectNote} to see disputes.` };
  const onTheWay = payouts.filter((p) => p.status === "SENT").reduce((s, p) => s + p.amountCents, 0);
  const openDisputes = disputes.filter((d) => UNRESOLVED_DISPUTE_STATES.has(d.state)).length;
  // Any scope the grant lacks → one Reconnect card on the Payments tab; the
  // other tabs show it in place of their own content.
  const needsReconnect = missingScopes.length > 0;
  const whatIsMissing = [
    !needPayouts || !needDisputes ? "payouts and disputes" : "",
    missingScopes.includes("ORDERS_READ") ? "the items behind a sale" : "",
    giftCards && missingScopes.some((s) => s.startsWith("GIFTCARDS")) ? "gift cards" : "",
  ].filter(Boolean);

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
        showAll={params.all === "1"}
        companyId={companyId}
        tz={tz}
        giftCardId={params.giftcard ?? null}
        cursor={params.cursor ?? null}
        canSell={manager}
        canActivate={isOwner}
        canReconnect={isOwner}
        missingScope={missingScopes.some((s) => s.startsWith("GIFTCARDS"))}
      />
    );
  } else if (params.payment) {
    body = <TransactionDetail companyId={companyId} tz={tz} paymentId={params.payment} canReconnect={isOwner} />;
  } else {
    const squareWin = win ?? (await loadSquareWindow(companyId, windowFrom, now));
    const { rows } = await loadReportRows(companyId, prevStart, now, squareWin);
    body = (
      <>
        <Overview
          rows={rows}
          tz={tz}
          range={range}
          tab={undefined}
          now={now}
          onTheWayCents={payoutsFailure ? null : onTheWay}
          payoutsNote={payoutsFailure ? (payoutsFailure.missingScopes ? payoutsFailure.message : "Square didn't answer") : "payouts Square has sent, not yet posted"}
          openDisputes={disputesFailure ? null : openDisputes}
          disputesNote={
            disputesFailure
              ? disputesFailure.missingScopes
                ? disputesFailure.message
                : "Square didn't answer"
              : openDisputes > 0
                ? "a client's bank questioned a charge"
                : "none open"
          }
        />
        <SquareTabs tab={tab} openDisputes={openDisputes} sandbox={sandbox} giftCards={giftCards} keep={keep} />
        <PaymentsTab companyId={companyId} actor={actor} tz={tz} page={page} filter={filter} window={squareWin} windowDays={OUTSIDE_WINDOW_DAYS} keep={keep} />
        <SquarePhoneLinks sandbox={sandbox} giftCards={giftCards} />
      </>
    );
  }

  return (
    <>
      {unreadable ? (
        <ReconnectCard what="" lost canReconnect={isOwner} />
      ) : (
        needsReconnect && listView && <ReconnectCard what={whatIsMissing.join(", ") || "everything Square reports"} canReconnect={isOwner} />
      )}
      {/* The list view draws the tab bar under its overview; the other tabs open on it. Gift cards draw their own way back. */}
      {!listView && tab !== "giftcards" && <SquareTabs tab={tab} openDisputes={openDisputes} sandbox={sandbox} giftCards={giftCards} keep={keep} />}
      {body}
    </>
  );
}
