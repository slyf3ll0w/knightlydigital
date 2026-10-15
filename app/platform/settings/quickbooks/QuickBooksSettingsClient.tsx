"use client";

import { GENERIC_ERROR, NETWORK_ERROR } from "@/lib/safe-fetch";
import { getCapacitor } from "@/components/NativeShell";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, RefreshCw, Unplug, AlertTriangle } from "lucide-react";
import SectionHeader from "@/components/SectionHeader";
import BackLink from "@/components/BackLink";
import PageTitle from "@/components/PageTitle";
import { Chip } from "@/components/ds";
import { confirmSheet } from "@/components/ConfirmSheet";

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
  unauthorized: "Only an owner or admin can link QuickBooks. Sign in as one and try again.",
  bad_state: "The connection request expired or didn't match your account. Please try again.",
  exchange_failed: "QuickBooks accepted the connection but the final handshake failed. Please try again.",
};

/**
 * Start the Intuit consent flow. On the web an ordinary redirect does it.
 * Inside the native shell a link to the /api route is thrown to the system
 * browser WITHOUT the session (the shell keeps only /app in its webview), so
 * the user saw this route's "Unauthorized" JSON instead of Intuit. Fetch the
 * consent URL with the app's cookies, then open it in the system browser via
 * Capacitor's Browser plugin; the callback finishes there off the signed
 * state and lands on /quickbooks-connected. Returns an error line, or null.
 */
async function startQuickBooksConnect(): Promise<string | null> {
  const browser = getCapacitor()?.Plugins?.Browser;
  if (!browser?.open) {
    window.location.assign("/api/app/quickbooks/connect");
    return null;
  }
  try {
    const res = await fetch("/api/app/quickbooks/connect?mode=url");
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.url) return data?.error ?? GENERIC_ERROR;
    await browser.open({ url: data.url });
    return null;
  } catch {
    return "Couldn't reach QuickBooks. Check your connection and try again.";
  }
}

function entityLabel(t: string): string {
  return t === "CUSTOMER"
    ? "Client"
    : t === "INVOICE"
      ? "Invoice"
      : t === "ESTIMATE"
        ? "Quote"
        : t === "PURCHASE"
          ? "Expense"
          : "Payment";
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
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");

  async function connect() {
    setConnectError("");
    setConnecting(true);
    const err = await startQuickBooksConnect();
    if (err) setConnectError(err);
    setConnecting(false);
  }
  // A failed status read is NOT "not connected" — showing the Connect card on
  // a 500 would invite someone to re-link a company that's already linked.
  const [loadError, setLoadError] = useState("");

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/app/quickbooks/status");
      if (res.ok) {
        setStatus(await res.json());
        setLoadError("");
      } else {
        const data = await res.json().catch(() => null);
        setLoadError(data?.error ?? "Couldn't load the QuickBooks connection status.");
      }
    } catch {
      setLoadError(NETWORK_ERROR);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // In the shell, consent happens in a browser sheet over the app — the
  // callback never reloads this page, so pick the connection up on the way
  // back (and poll briefly for the first sync's numbers).
  useEffect(() => {
    let timers: ReturnType<typeof setTimeout>[] = [];
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      loadStatus();
      timers.forEach(clearTimeout);
      timers = [4000, 12000].map((ms) => setTimeout(loadStatus, ms));
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      timers.forEach(clearTimeout);
    };
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
        const failed =
          s.invoices.failed +
          s.payments.failed +
          (s.quotes?.failed ?? 0) +
          (s.expenses?.failed ?? 0);
        const parts = [
          `${s.invoices.pushed} invoice${s.invoices.pushed === 1 ? "" : "s"}`,
          `${s.payments.pushed} payment${s.payments.pushed === 1 ? "" : "s"}`,
          `${s.quotes?.pushed ?? 0} quote${(s.quotes?.pushed ?? 0) === 1 ? "" : "s"}`,
          `${s.expenses?.pushed ?? 0} expense${(s.expenses?.pushed ?? 0) === 1 ? "" : "s"}`,
        ];
        setSyncMessage(
          `Synced ${parts.join(", ")}` +
            (failed > 0 ? ` · ${failed} failed (details below)` : "") +
            (s.done ? "" : " · large backlog — run again to continue")
        );
      }
    } catch {
      setSyncError(NETWORK_ERROR);
    }
    setSyncing(false);
    loadStatus();
  }

  async function disconnect() {
    if (
      !(await confirmSheet({
        title: "Disconnect QuickBooks?",
        message:
          "Already-synced data stays in QuickBooks, but nothing new will sync until you reconnect.",
        confirmLabel: "Disconnect",
        destructive: true,
      }))
    )
      return;
    setDisconnecting(true);
    setSyncMessage("");
    setSyncError("");
    try {
      const res = await fetch("/api/app/quickbooks/disconnect", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setSyncError(data?.error ?? "Couldn't disconnect QuickBooks — please try again.");
        return;
      }
    } catch {
      setSyncError(NETWORK_ERROR);
      return;
    } finally {
      setDisconnecting(false);
    }
    loadStatus();
  }

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <div className="flex items-start gap-3 mb-6">
        <BackLink href="/app/settings" className="mt-1.5" />
        <PageTitle info="Push your clients, invoices, and payments into QuickBooks so your books stay current without re-typing anything.">
          QuickBooks Online
        </PageTitle>
      </div>

      {callbackError && (
        <div role="alert" className="form-error mb-6 flex items-start gap-2 p-4">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {CALLBACK_ERRORS[callbackError] ?? "Something went wrong connecting to QuickBooks."}
        </div>
      )}
      {justConnected && (
        <div className="mb-6 flex items-start gap-2 rounded-lg bg-[color:var(--ds-good-soft)] p-4 text-sm text-[color:var(--ds-good)]">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          Connected! Your first sync is running in the background — the numbers below will fill in
          as it finishes.
        </div>
      )}

      {!configured ? (
        <div className="ds-card p-5">
          <SectionHeader
            title="Coming Soon"
            hint="The QuickBooks connection isn't enabled on this server yet. Check back soon."
          />
        </div>
      ) : loading ? (
        <div className="ds-card p-8 flex items-center justify-center text-gray-400">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : loadError ? (
        <div className="ds-card p-5 space-y-3">
          <div role="alert" className="form-error flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            {loadError}
          </div>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              loadStatus();
            }}
            className="ds-btn ds-btn-outline ds-btn-sm"
          >
            <RefreshCw size={13} />
            Try again
          </button>
        </div>
      ) : !status?.connected ? (
        <div className="ds-card p-5 space-y-4">
          <div>
            <SectionHeader
              title="Connect Your QuickBooks"
              hint="One-way sync, from WorkBench into QuickBooks — nothing in QuickBooks is changed unless it came from here:"
            />
            <ul className="text-sm text-gray-600 mt-2 space-y-1 list-disc pl-5">
              <li>Clients become QuickBooks customers (matched by name, no duplicates)</li>
              <li>Sent and paid invoices appear with their line items, discounts, and tax</li>
              <li>Payments are applied against the right invoice automatically</li>
            </ul>
            <p className="text-xs text-gray-500 mt-2">
              Invoice lines bill against a single &ldquo;WorkBench Services&rdquo; item in your
              books — ask your accountant if they want it mapped differently.
            </p>
          </div>
          <button
            type="button"
            onClick={connect}
            disabled={connecting}
            className="inline-flex items-center gap-2 rounded-[10px] btn-tool bg-[#2CA01C] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#248217] disabled:opacity-60"
          >
            {connecting && <Loader2 size={15} className="animate-spin" />}
            Connect to QuickBooks
          </button>
          {connectError && (
            <p role="alert" className="text-sm text-[color:var(--ds-bad)]">
              {connectError}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="ds-card p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <SectionHeader title="Connected" />
                <p className="text-sm text-gray-600 mt-1">
                  <CheckCircle2 size={14} className="inline mr-1 text-[color:var(--ds-good)]" />
                  {status.qboCompanyName || `QuickBooks company ${status.realmId}`}
                  {status.environment === "sandbox" && (
                    <span className="ml-2 inline-flex align-middle">
                      <Chip tone="warn">Sandbox</Chip>
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500 mt-1">
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
                className="ds-btn ds-btn-primary shrink-0 disabled:opacity-50"
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
              <div className="flex items-start gap-2 rounded-lg bg-[color:var(--ds-warn-soft)] p-3 text-sm text-[color:var(--ds-warn)]">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <div>
                  {status.reconnectNeeded
                    ? "QuickBooks needs to be reconnected — the authorization expired."
                    : status.lastSyncError}
                  {status.reconnectNeeded && (
                    <button
                      type="button"
                      onClick={connect}
                      disabled={connecting}
                      className="ml-2 font-semibold underline hover:no-underline disabled:opacity-60"
                    >
                      {connecting ? "Opening…" : "Reconnect"}
                    </button>
                  )}
                  {connectError && <span className="ml-2 text-[color:var(--ds-bad)]">{connectError}</span>}
                </div>
              </div>
            )}
            {syncMessage && <p className="text-sm text-[color:var(--ds-good)]">{syncMessage}</p>}
            {syncError && <p className="text-sm text-[color:var(--ds-bad)]">{syncError}</p>}
            <p className="text-xs text-gray-500">
              New payments push to QuickBooks as they&apos;re recorded, and everything else sweeps
              in nightly — Sync now just does it immediately.
            </p>
          </div>

          {(status.counts?.errors ?? 0) > 0 && (
            <div className="ds-card p-5 space-y-3">
              <SectionHeader
                title={`Sync Problems (${status.counts?.errors})`}
                hint="These records couldn't sync — they retry on every sync. If one keeps failing, the message usually says what QuickBooks objected to."
              />
              <ul className="divide-y divide-gray-100">
                {(status.recentErrors ?? []).map((e, i) => (
                  <li key={i} className="py-2">
                    <p className="text-sm font-medium text-gray-700">
                      {entityLabel(e.entityType)}
                      <span className="ml-2 text-xs font-normal text-gray-400">
                        {new Date(e.lastSyncedAt).toLocaleString()}
                      </span>
                    </p>
                    <p className="text-xs text-[color:var(--ds-bad)] mt-0.5 break-words">{e.error}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="ds-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <SectionHeader
                  title="Disconnect"
                  hint="Stops all syncing. Everything already in QuickBooks stays there."
                />
              </div>
              <button
                type="button"
                onClick={disconnect}
                disabled={disconnecting}
                className="flex shrink-0 items-center gap-1.5 rounded-[10px] btn-tool-line bg-white px-3.5 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
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
