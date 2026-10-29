import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { Chip, InfoTip } from "@/components/ds";
import EmptyState from "@/components/EmptyState";
import { money, shortDate } from "@/lib/statuses";
import { listSquareDisputeEvidence, type SellerDispute, type SellerReadFailure } from "@/lib/square-seller-reports";
import { ReconnectCard, RuledLabel, SquareLinkRows, SquareUnavailable, TabBack } from "./bits";
import { cardBrandLabel, disputeReasonLabel, disputeState } from "./labels";
import DisputeActions from "./DisputeActions";

/**
 * Disputes tab (Square): a client's bank questioned a charge. List with
 * state, reason, amount and the respond-by date; the detail shows the
 * disputed payment (linked to our invoice when WorkBench took it), the
 * evidence so far, and — for managers while the dispute is open — upload,
 * written explanation, send to the bank, or accept with a confirm.
 */
export default async function DisputesTab({
  companyId,
  tz,
  disputes,
  failure,
  disputeId,
  canAct,
  sandbox,
  canReconnect,
}: {
  companyId: string;
  tz: string;
  disputes: SellerDispute[];
  failure: SellerReadFailure | null;
  disputeId: string | null;
  canAct: boolean;
  sandbox: boolean;
  canReconnect: boolean;
}) {
  if (failure?.missingScopes) return <ReconnectCard what="disputes and payouts" canReconnect={canReconnect} />;

  const dueLine = (d: SellerDispute) => {
    if (!d.dueAt) return null;
    const days = Math.ceil((new Date(d.dueAt).getTime() - Date.now()) / 86_400_000);
    const when = shortDate(d.dueAt, tz);
    if (days < 0) return `respond-by passed (${when})`;
    if (days === 0) return `respond today (${when})`;
    return `respond by ${when} · ${days} ${days === 1 ? "day" : "days"}`;
  };

  if (disputeId) {
    const d = disputes.find((x) => x.id === disputeId) ?? null;
    if (!d) {
      return (
        <div className="mb-8">
          <TabBack tab="disputes" label="Disputes" />
          <div className="ds-card overflow-hidden">
            <EmptyState compact title="Dispute not found" body="It may have been resolved, or Square didn't list it just now." />
          </div>
        </div>
      );
    }
    const [evidenceRead, recorded] = await Promise.all([
      listSquareDisputeEvidence(companyId, d.id),
      d.paymentId
        ? prisma.payment.findFirst({
            where: { companyId, processorRef: d.paymentId },
            select: { id: true, amount: true, paidAt: true, invoiceId: true, invoice: { select: { invoiceNumber: true } }, contact: { select: { firstName: true, lastName: true } } },
          })
        : Promise.resolve(null),
    ]);
    const state = disputeState(d.state);
    const due = dueLine(d);
    return (
      <div className="mb-8">
        <TabBack tab="disputes" label="Disputes" />
        <div className="ds-card mb-4 overflow-hidden">
          <div className="p-5 sm:p-6">
            <p className="ds-label">{disputeReasonLabel(d.reason)}</p>
            <p className="numeral-ledger mt-1 text-[34px] font-semibold leading-none text-[color:var(--ds-ink)]">{money(d.amountCents / 100)}</p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-500">
              <Chip tone={state.tone}>{state.label}</Chip>
              {d.cardBrand && <span>{cardBrandLabel(d.cardBrand)}</span>}
              {d.reportedDate && <span>· opened {shortDate(d.reportedDate, tz)}</span>}
              {due && state.open && <span className={d.dueAt && new Date(d.dueAt).getTime() - Date.now() < 3 * 86_400_000 ? "text-[color:var(--ds-bad)] font-medium" : ""}>· {due}</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--ds-line)] bg-[color:var(--ds-surface-2)] px-5 py-3 sm:px-6">
            <div className="text-xs text-gray-500">
              {recorded ? (
                <>
                  Charged {shortDate(recorded.paidAt, tz)} · {recorded.contact ? `${recorded.contact.firstName} ${recorded.contact.lastName}` : "—"} · Invoice #
                  {recorded.invoice?.invoiceNumber}
                </>
              ) : d.paymentId ? (
                <>Square payment {d.paymentId.slice(0, 12)}… — taken outside WorkBench</>
              ) : (
                <>Disputed payment not named by Square</>
              )}
            </div>
            {recorded && (
              <Link prefetch={false} href={`/app/invoices/${recorded.invoiceId}`} className="ds-btn ds-btn-outline ds-btn-sm">
                Open invoice <ChevronRight size={13} />
              </Link>
            )}
          </div>
        </div>

        <RuledLabel
          info={
            <>
              Upload what shows the charge was right: the invoice, the signed quote or agreement, photos of the finished
              work, the sign-off, and messages with the client (PDF, JPG or PNG, 5 MB each). Add a short written
              explanation too. Square sends it all to the client&apos;s bank when you press Send — or automatically on the
              respond-by date. Accepting means you agree the client should get the money back.
            </>
          }
        >
          Evidence
        </RuledLabel>
        {!evidenceRead.ok && <SquareUnavailable failure={evidenceRead} what="the evidence list" />}
        <div className="ds-card p-4 sm:p-5">
          <DisputeActions
            disputeId={d.id}
            open={state.open}
            canAct={canAct}
            amountLabel={money(d.amountCents / 100)}
            initialEvidence={(evidenceRead.ok ? evidenceRead.data.evidence : []).map((e) => ({
              id: e.id,
              evidenceType: e.evidenceType,
              fileName: e.fileName,
              text: e.text,
              uploadedAt: e.uploadedAt,
            }))}
          />
          {!canAct && state.open && (
            <p className="mt-3 flex items-center gap-1 text-xs text-gray-500">
              Only owners and admins can answer a dispute.
              <InfoTip>Uploading evidence or accepting a dispute moves the business&apos;s money, so it is a manager action.</InfoTip>
            </p>
          )}
        </div>
      </div>
    );
  }

  const open = disputes.filter((d) => disputeState(d.state).open);
  const rest = disputes.filter((d) => !disputeState(d.state).open);
  const row = (d: SellerDispute) => {
    const s = disputeState(d.state);
    const due = dueLine(d);
    return (
      <Link
        key={d.id}
        prefetch={false}
        href={`/app/payments?tab=disputes&dispute=${encodeURIComponent(d.id)}`}
        className="flex lg:grid lg:grid-cols-[110px_1fr_170px_110px_28px] gap-4 items-center px-4 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
      >
        <span className="text-sm text-gray-500 w-20 lg:w-auto shrink-0">{shortDate(d.reportedDate ?? d.createdAt, tz)}</span>
        <span className="flex-1 lg:flex-none min-w-0">
          <span className="block truncate text-sm font-medium text-gray-900">{disputeReasonLabel(d.reason)}</span>
          <span className="block truncate text-xs text-gray-500">
            {d.cardBrand ? cardBrandLabel(d.cardBrand) : "Card"}
            {s.open && due ? ` · ${due}` : ""}
            <span className="lg:hidden"> · {s.label}</span>
          </span>
        </span>
        <span className="hidden lg:block">
          <Chip tone={s.tone}>{s.label}</Chip>
        </span>
        <span className="numeral-ledger text-sm font-semibold text-gray-900 text-right">{money(d.amountCents / 100)}</span>
        <ChevronRight size={14} className="hidden text-gray-400 lg:block" />
      </Link>
    );
  };

  return (
    <>
      <div className="mb-8">
        <RuledLabel
          info={
            <>
              A dispute (chargeback) is a client asking their bank to reverse a charge. Square holds the amount from your
              balance while the bank decides. You can answer with evidence or accept it; nothing happens to the money
              until the bank rules. Few businesses see more than one or two a year.
            </>
          }
          action={open.length > 0 ? <Chip tone="bad">{open.length} need a response</Chip> : undefined}
        >
          Disputes
        </RuledLabel>
        {failure && <SquareUnavailable failure={failure} what="disputes" />}
        <div className="ds-card overflow-hidden">
          {disputes.length === 0 ? (
            <EmptyState
              compact
              title={failure ? "Couldn't read Square just now" : "No disputes"}
              body={
                failure
                  ? "Disputes will list here once Square answers."
                  : sandbox
                    ? "Nothing disputed. In Square's test mode a payment of $88.01–$88.09 creates a test dispute."
                    : "No client has disputed a charge. If one does, it appears here with the respond-by date."
              }
            />
          ) : (
            <div className="divide-y divide-gray-100">
              <div className="hidden lg:grid grid-cols-[110px_1fr_170px_110px_28px] gap-4 px-4 py-2 text-xs font-medium text-gray-500 bg-gray-50">
                <span>Opened</span>
                <span>Reason</span>
                <span>Status</span>
                <span className="text-right">Amount</span>
                <span></span>
              </div>
              {open.map(row)}
              {rest.map(row)}
            </div>
          )}
        </div>
      </div>

      <div className="mb-8">
        <RuledLabel info="Square's own disputes screen shows the same cases with the bank's letters attached — same sign-in.">In Square</RuledLabel>
        <SquareLinkRows sandbox={sandbox} rows={[{ screen: "disputes", title: "Disputes in Square", sub: "The bank's notices and Square's record of each case" }]} />
      </div>
    </>
  );
}
