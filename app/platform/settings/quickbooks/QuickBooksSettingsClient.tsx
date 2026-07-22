"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2, RefreshCw, Unplug, AlertTriangle } from "lucide-react";

type Status = {
  configured: boolean;
  connected: boolean;
  environment?: "sandbox" | "production";
  qboCompanyName?: string | null;
  realmId?: string;
  autoSync?: boolean;
  lastSyncAt?: string | null;
  lastSyncError?: string | null;
  reconnectNeeded?: boolean;
  counts?: { synced: number; errors: number; invoicesTotal: number; invoicesSynced: number };
  recentErrors?: { entityType: string; localId: string; error: string | null; lastSyncedAt: string }[];
};

const CALLBACK_ERRORS: Record<string, string> = {
  denied: "Connection was cancelled on the QuickBooks screen — nothing was linked.",
  missing_params: "QuickBooks sent back an incomplete response. Please try connecting again.",
  unauthorized: "Your session expired during the connection. Sign in and try again.",
  bad_state: "The connection request expired or didn't match your account. Please try again.",
  exchange_failed: "QuickBooks accepted the connection but the final handshake failed. Please try again.",
};

function entityLabel(t: string): string {
  return t === "CUSTOMER" ? "Client" : t === "INVOICE" ? "Invoice" : "Payment";
}

export default function QuickBooksSettingsClient({ configured }: { configured: boolean }) {
  const searchParams = useSearchParams();
  const callbackError = searchParams.get("error");
  const justConnected = searchParams.get("connected") === "1";

  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [syncError, setSyncError] = useState("");
  const [disconnecting, setDisconnecting] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/app/quickbooks/status");
      if (res.ok) setStatus(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Right after connecting, the first sync runs in the background — poll a
  // few times so the numbers fill in without a manual refresh.
  useEffect(() => {
    if (!justConnected) return;
    const timers = [3000, 8000, 15000, 30000].map((ms) => setTimeout(loadStatus, ms));
    return () => timers.forEach(clearTimeout);
  }, [justConnected, loadStatus]);

  async function syncNow() {
    setSyncing(true);
    setSyncMessage("");
    setSyncError("");
    try {
      const res = await fetch("/api/app/quickbooks/sync", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setSyncError(data?.error ?? "Sync failed — please try again.");
      } else {
        const s = data.summary;
        setSyncMessage(
          `Synced ${s.invoices.pushed} invoice${s.invoices.pushed === 1 ? "" : "s"} and ${s.payments.pushed} payment${s.payments.pushed === 1 ? "" : "s"}` +
            (s.invoices.failed + s.payments.failed > 0
              ? ` · ${s.invoices.failed + s.payments.failed} failed (details below)`
              : "") +
            (s.done ? "" : " · large backlog — run again to continue")
        );
      }
    } catch {
      setSyncError("Couldn't reach the server. Check your connection and try again.");
    }
    setSyncing(false);
    loadStatus();
  }

  async function disconnect() {
    if (
      !confirm(
        "Disconnect QuickBooks? Already-synced data stays in QuickBooks, but nothing new will sync until you reconnect."
      )
    )
      return;
    setDisconnecting(true);
    await fetch("/api/app/quickbooks/disconnect", { method: "POST" });
    setDisconnecting(false);
    setSyncMessage("");
    setSyncError("");
    loadStatus();
  }

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <Link
        href="/app/settings"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft size={14} />
        Settings
      </Link>
      <div className="mb-6">
        <h1 className="numeral-ledger text-2xl font-semibold text-gray-900">QuickBooks Online</h1>
        <p className="text-sm text-gray-500">
          Push your clients, invoices, and payments into QuickBooks so your books stay current
          without re-typing anything
        </p>
      </div>

      {callbackError && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {CALLBACK_ERRORS[callbackError] ?? "Something went wrong connecting to QuickBooks."}
        </div>
      )}
      {justConnected && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          Connected! Your first sync is running in the background — the numbers below will fill in
          as it finishes.
        </div>
      )}

      {!configured ? (
        <div className="card-ledger p-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Coming Soon
          </h2>
          <p className="text-sm text-gray-500 mt-2">
            The QuickBooks connection isn&apos;t enabled on this server yet. Check back soon.
          </p>
        </div>
      ) : loading ? (
        <div className="card-ledger p-8 flex items-center justify-center text-gray-400">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : !status?.connected ? (
        <div className="card-ledger p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Connect Your QuickBooks
            </h2>
            <p className="text-sm text-gray-500 mt-1.5">
              One-way sync, from the Hub into QuickBooks — nothing in QuickBooks is changed unless
              it came from here:
            </p>
            <ul className="text-sm text-gray-600 mt-2 space-y-1 list-disc pl-5">
              <li>Clients become QuickBooks customers (matched by name, no duplicates)</li>
              <li>Sent and paid invoices appear with their line items, discounts, and tax</li>
              <li>Payments are applied against the right invoice automatically</li>
            </ul>
            <p className="text-xs text-gray-400 mt-2">
              Invoice lines bill against a single &ldquo;WorkBench Services&rdquo; item in your
              books — ask your accountant if they want it mapped differently.
            </p>
          </div>
          <a
            href="/api/app/quickbooks/connect"
            className="inline-flex items-center gap-2 rounded-[10px] btn-tool bg-[#2CA01C] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#248217]"
          >
            Connect to QuickBooks
          </a>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="card-ledger p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  Connected
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  <CheckCircle2 size={14} className="inline mr-1 text-green-600" />
                  {status.qboCompanyName || `QuickBooks company ${status.realmId}`}
                  {status.environment === "sandbox" && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                      Sandbox
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {status.lastSyncAt
                    ? `Last synced ${new Date(status.lastSyncAt).toLocaleString()}`
                    : "Not synced yet"}
                  {" · "}
                  {status.counts?.invoicesSynced ?? 0} of {status.counts?.invoicesTotal ?? 0}{" "}
                  invoices in QuickBooks
                </p>
              </div>
              <button
                type="button"
                onClick={syncNow}
                disabled={syncing}
                className="flex shrink-0 items-center gap-2 rounded-[10px] btn-tool bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
              >
                {syncing ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                {syncing ? "Syncing…" : "Sync now"}
              </button>
            </div>

            {(status.reconnectNeeded || status.lastSyncError) && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <div>
                  {status.reconnectNeeded
                    ? "QuickBooks needs to be reconnected — the authorization expired."
                    : status.lastSyncError}
                  {status.reconnectNeeded && (
                    <a
                      href="/api/app/quickbooks/connect"
                      className="ml-2 font-semibold underline hover:no-underline"
                    >
                      Reconnect
                    </a>
                  )}
                </div>
              </div>
            )}
            {syncMessage && <p className="text-sm text-green-700">{syncMessage}</p>}
            {syncError && <p className="text-sm text-red-600">{syncError}</p>}
            <p className="text-xs text-gray-400">
              New payments push to QuickBooks as they&apos;re recorded, and everything else sweeps
              in nightly — Sync now just does it immediately.
            </p>
          </div>

          {(status.counts?.errors ?? 0) > 0 && (
            <div className="card-ledger p-5 space-y-3">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Sync Problems ({status.counts?.errors})
              </h2>
              <p className="text-xs text-gray-400">
                These records couldn&apos;t sync — they retry on every sync. If one keeps failing,
                the message usually says what QuickBooks objected to.
              </p>
              <ul className="divide-y divide-gray-100">
                {(status.recentErrors ?? []).map((e, i) => (
                  <li key={i} className="py-2">
                    <p className="text-sm font-medium text-gray-700">
                      {entityLabel(e.entityType)}
                      <span className="ml-2 text-xs font-normal text-gray-400">
                        {new Date(e.lastSyncedAt).toLocaleString()}
                      </span>
                    </p>
                    <p className="text-xs text-red-600 mt-0.5 break-words">{e.error}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-lg border border-gray-200 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  Disconnect
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Stops all syncing. Everything already in QuickBooks stays there.
                </p>
              </div>
              <button
                type="button"
                onClick={disconnect}
                disabled={disconnecting}
                className="flex shrink-0 items-center gap-1.5 rounded-[10px] border border-gray-300 px-3.5 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                {disconnecting ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Unplug size={13} />
                )}
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
