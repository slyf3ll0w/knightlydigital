"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Copy, LifeBuoy, PhoneCall, RefreshCw } from "lucide-react";
import BackLink from "@/components/BackLink";
import { ActionLink, Button, Card, Chip, DsPage, InfoTip, PageHeader, SectionTitle } from "@/components/ds";
import { alertSheet, confirmSheet, promptSheet } from "@/components/ConfirmSheet";
import { getCapacitor } from "@/components/NativeShell";
import { postJson } from "@/lib/safe-fetch";
import { money } from "@/lib/statuses";
import { SETUP_CALL_LABEL, SETUP_CALL_PATH } from "@/lib/setup-call";
import { ADS_ADVISOR_PROMPT, ADS_FIELD_MAP, ADS_SAMPLE_HOURS } from "@/lib/ads-conversions";
import { prettyCustomerId } from "@/lib/google-ads-shape";
import type { AdsFeedStatus } from "@/lib/ads-conversions-server";
import type { AdsConnectStatus } from "@/lib/google-ads";

/**
 * Report paid jobs to Google Ads. Laid out like the rest of the app
 * (docs/design-system.md): the thing to do first, explanations in (i)
 * bubbles.
 *
 *   Connect Google Ads — one sign-in and WorkBench does the rest (only when
 *     the server has it set up). Connected: the account, when payments last
 *     went, Send now, Disconnect.
 *   What Google is being told — the numbers.
 *   Set it up by hand — the fetched file, in two parts: (1) the conversion
 *     action, by pasting a message into Google's Advisor or by hand, (2) the
 *     file connection in Google's Data manager, screen by screen. Folded
 *     away when Connect is on offer; the only way when it is not.
 *   Stuck? — ask WorkBench for help from right here, or book a setup call.
 */
type Account = { customerId: string; name: string };
type ConnectData = AdsConnectStatus & { accounts?: Account[] };

const OUTCOMES: Record<string, { tone: "ok" | "err"; text: string }> = {
  connected: { tone: "ok", text: "Google Ads is connected. Payments from your ad leads are sent to Google from now on." },
  pick_account: { tone: "ok", text: "Signed in. Pick the Google Ads account to report to." },
  no_accounts: { tone: "err", text: "That Google sign-in has no Google Ads account. Sign in with the Google account you use for Google Ads." },
  denied: { tone: "err", text: "Google connection cancelled. Nothing was changed." },
  expired: { tone: "err", text: "That connection link expired. Press Connect Google Ads again." },
  failed: { tone: "err", text: "Google didn't complete the connection." },
};

export default function GoogleAdsClient({
  initial,
  initialConnect,
  timeZone,
  outcome,
  outcomeWhy,
}: {
  initial: AdsFeedStatus;
  initialConnect: AdsConnectStatus;
  timeZone: string;
  outcome: string | null;
  outcomeWhy: string | null;
}) {
  const [status, setStatus] = useState(initial);
  const [connect, setConnect] = useState<ConnectData>(initialConnect);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  // by hand is the only way when Connect is not on offer; otherwise it is folded away unless already in use
  const [handOpen, setHandOpen] = useState(!initialConnect.available || (initial.enabled && !initialConnect.connected));
  const [actionByHand, setActionByHand] = useState(false);
  const flash = outcome ? OUTCOMES[outcome] ?? null : null;

  // several Google Ads accounts under one sign-in: fetch the list to pick from
  useEffect(() => {
    if (!initialConnect.needsAccount) return;
    let live = true;
    fetch("/api/app/ads-connection", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ConnectData | null) => {
        if (live && d) setConnect(d);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [initialConnect.needsAccount]);

  async function feed(key: string, method: "POST" | "DELETE", body?: unknown) {
    setBusy(key);
    setError(null);
    const { ok, data } = await postJson<AdsFeedStatus>("/api/app/ads-conversions", body, method);
    setBusy(null);
    if (!ok || !data) setError(data?.error ?? "That didn't save. Try again.");
    else setStatus(data);
  }

  async function connection(key: string, method: "POST" | "DELETE", body?: unknown) {
    setBusy(key);
    setError(null);
    const { ok, data } = await postJson<ConnectData>("/api/app/ads-connection", body, method);
    setBusy(null);
    if (!ok || !data) setError(data?.error ?? "That didn't work. Try again.");
    else setConnect(data);
  }

  /** Google's screen can't load inside the phone app, so there it opens in the system browser (same as Google Calendar). */
  async function startConnect() {
    const browser = getCapacitor()?.Plugins?.Browser;
    if (!browser?.open) {
      window.location.assign("/api/app/integrations/google-ads/connect");
      return;
    }
    setBusy("connect");
    try {
      const res = await fetch("/api/app/integrations/google-ads/connect?mode=url");
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) setError(data?.error ?? "Couldn't reach Google. Try again.");
      else await browser.open({ url: data.url });
    } catch {
      setError("Couldn't reach Google. Check your connection and try again.");
    }
    setBusy(null);
  }

  async function disconnect() {
    const yes = await confirmSheet({
      title: "Disconnect Google Ads?",
      message: "WorkBench stops sending payments to Google Ads. What Google has already counted stays counted.",
      confirmLabel: "Disconnect",
      destructive: true,
    });
    if (yes) void connection("disconnect", "DELETE");
  }

  async function newAddress() {
    const yes = await confirmSheet({
      title: "Make a new file address?",
      message: "The address Google Ads has now stops working right away. Paste the new one into Google Ads or nothing more is reported.",
      confirmLabel: "Make new address",
      destructive: true,
    });
    if (yes) void feed("new", "POST");
  }

  async function turnOff() {
    const yes = await confirmSheet({
      title: "Stop the file?",
      message: "The file address stops working right away. What Google has already counted stays counted.",
      confirmLabel: "Turn off",
      destructive: true,
    });
    if (yes) void feed("off", "DELETE");
  }

  /** The failsafe: one tap sends WorkBench a help request from this page, with where the setup stands. */
  async function askForHelp() {
    const note = await promptSheet({
      title: "Ask WorkBench for help",
      message: "Tell us where you got stuck. We'll reply by email and can do the setup with you.",
      placeholder: "For example: Next is grey on Select data",
      confirmLabel: "Send",
    });
    if (note === null) return;
    setBusy("help");
    const where = [
      connect.available ? (connect.connected ? `Connect: signed in as ${connect.googleEmail}${connect.accountName ? `, account ${connect.accountName}` : ", no account picked"}` : "Connect: not connected") : "Connect: not offered",
      connect.lastError ? `Last Google error: ${connect.lastError}` : "",
      `File: ${status.enabled ? "on" : "off"}${status.fetchedAt ? `, last fetched ${status.fetchedAt}` : ", never fetched"}${status.sampleUntil ? ", sample row in file" : ""}`,
      `Ad leads ${status.adLeads}, payments ${status.payments}`,
    ]
      .filter(Boolean)
      .join("\n");
    const { ok, data } = await postJson("/api/app/feedback", {
      type: "BUG",
      title: "Help setting up Google Ads reporting",
      details: `${note.trim() || "(no note)"}\n\n${where}`,
      pageUrl: "Report paid jobs to Google Ads",
    });
    setBusy(null);
    if (ok) await alertSheet({ title: "Sent", message: "We got it. We'll reply by email, usually within one business day." });
    else setError((data as { error?: string } | null)?.error ?? "That didn't send. Try again, or book a setup call.");
  }

  async function copy(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* the value is on screen to select by hand */
    }
  }

  const at = (iso: string, withDay = true) =>
    new Date(iso).toLocaleString("en-US", { ...(withDay ? { month: "short", day: "numeric" } : {}), hour: "numeric", minute: "2-digit", timeZone });
  const leftOut = status.tooLate + status.noClickId;
  const linked = connect.connected && !connect.needsAccount;

  /** One value to paste into Google Ads, with its own Copy. */
  const field = (key: string, label: string, value: string, info?: string) => (
    <div className="flex items-end gap-2">
      <span className="min-w-0 flex-1">
        <span className="ds-label flex items-center gap-1">
          {label}
          {info && <InfoTip>{info}</InfoTip>}
        </span>
        <code className="mt-1 block truncate rounded-[10px] bg-[color:var(--ds-surface-2)] px-3 py-2 text-[13px] text-[color:var(--ds-ink)]" title={value} data-testid={`ads-feed-${key}`}>
          {value}
        </code>
      </span>
      <Button variant="outline" size="sm" icon={copied === key ? Check : Copy} onClick={() => void copy(key, value)} aria-label={`Copy ${label.toLowerCase()}`}>
        {copied === key ? "Copied" : "Copy"}
      </Button>
    </div>
  );

  /** One numbered step: the number, what to do, and whatever that step needs under it. */
  const step = (n: number, title: string, children: React.ReactNode) => (
    <li className="flex gap-3.5 px-4 py-4 lg:gap-4 lg:px-5">
      <span className="ds-num w-5 shrink-0 text-[17px] font-semibold leading-6 text-[color:var(--ds-primary)]" aria-hidden>
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h4 className="text-[14.5px] font-semibold leading-6 text-[color:var(--ds-ink)]">{title}</h4>
        <div className="mt-1 space-y-3 text-[14px] leading-relaxed text-[color:var(--ds-ink)]">{children}</div>
      </div>
    </li>
  );

  return (
    <DsPage className="!max-w-3xl">
      <div className="flex items-end gap-3">
        <BackLink href="/app/insights/lead-sources" className="mb-1.5" />
        <PageHeader
          className="min-w-0 flex-1"
          title="Report paid jobs to Google Ads"
          info="When a lead who clicked one of your Google ads pays an invoice, Google Ads can be told what that click was worth. Its bidding then goes after clicks that turn into paid work, not only clicks that fill in a form."
        />
      </div>

      {flash && !error && (
        <div role="status" className={flash.tone === "ok" ? "mt-5 rounded-[12px] bg-[color:var(--ds-surface-2)] px-3.5 py-3 text-[14px] text-[color:var(--ds-ink)]" : "form-error mt-5"} data-testid="ads-connect-outcome">
          {flash.text}
          {flash.tone === "err" && outcomeWhy ? ` Google said: ${outcomeWhy}` : ""}
        </div>
      )}
      {error && (
        <div role="alert" className="form-error mt-5">
          {error}
        </div>
      )}

      <div className="mt-6 space-y-8">
        {/* ── one click: sign in with Google and WorkBench does the rest ── */}
        {connect.available && (
          <Card className="ds-rise p-5" data-testid="ads-connect">
            {!connect.connected ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <p className="flex min-w-0 flex-1 items-start gap-1.5 text-[14.5px] text-[color:var(--ds-ink)]">
                  <span className="min-w-0">Sign in with the Google account you use for Google Ads. WorkBench sets everything up and reports paid jobs by itself.</span>
                  <InfoTip>
                    Google asks you to let WorkBench manage your Google Ads conversions. WorkBench uses that to add one conversion action, named WorkBench paid job, and to send it the ad click ID, amount and time of each payment from an ad lead. It never sends a name, email, phone number or address, and it doesn&apos;t touch your campaigns, budgets or bidding.
                  </InfoTip>
                </p>
                <Button loading={busy === "connect"} onClick={() => void startConnect()} data-testid="ads-connect-start">
                  Connect Google Ads
                </Button>
              </div>
            ) : connect.needsAccount ? (
              <div>
                <p className="text-[14.5px] font-semibold text-[color:var(--ds-ink)]">Which Google Ads account?</p>
                <p className="ds-small mt-0.5">Signed in as {connect.googleEmail}</p>
                {connect.lastError && <p className="mt-2 text-[13.5px] text-[color:var(--ds-bad)]">{connect.lastError}</p>}
                <ul className="ds-divide mt-3 overflow-hidden rounded-[12px] border border-[color:var(--ds-line)]">
                  {(connect.accounts ?? []).map((a) => (
                    <li key={a.customerId} className="flex items-center gap-3 px-3.5 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14.5px] font-medium text-[color:var(--ds-ink)]">{a.name}</span>
                        <span className="ds-small ds-num block">{prettyCustomerId(a.customerId)}</span>
                      </span>
                      <Button variant="soft" size="sm" loading={busy === `pick-${a.customerId}`} disabled={!!busy} onClick={() => void connection(`pick-${a.customerId}`, "POST", { customerId: a.customerId })}>
                        Use this one
                      </Button>
                    </li>
                  ))}
                  {(connect.accounts ?? []).length === 0 && <li className="ds-small px-3.5 py-3">Reading your Google Ads accounts…</li>}
                </ul>
                <Button variant="ghost" size="sm" className="mt-3" disabled={!!busy} onClick={() => void disconnect()}>
                  Disconnect
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5">
                    {connect.needsReconnect ? <Chip tone="bad">Needs you</Chip> : <Chip tone="good">Connected</Chip>}
                    <span className="min-w-0 truncate text-[14.5px] font-medium text-[color:var(--ds-ink)]">
                      {connect.accountName}
                      {connect.customerId ? <span className="ds-num font-normal text-[color:var(--ds-muted)]"> · {prettyCustomerId(connect.customerId)}</span> : null}
                    </span>
                  </div>
                  <p className="ds-small mt-1">
                    {connect.needsReconnect
                      ? "Google no longer accepts this sign-in. Connect again to keep reporting."
                      : connect.lastSyncAt
                        ? `Last sent ${at(connect.lastSyncAt)} · ${connect.lastSyncCount ?? 0} ${connect.lastSyncCount === 1 ? "payment" : "payments"}`
                        : "First send is on its way."}
                  </p>
                  {connect.lastError && !connect.needsReconnect && (
                    <p className="mt-1.5 flex items-start gap-1 text-[13.5px] text-[color:var(--ds-bad)]">
                      <span className="min-w-0">Google said: {connect.lastError}</span>
                      <InfoTip>A conversion action made in the last few hours can refuse payments at first. WorkBench tries again by itself several times a day.</InfoTip>
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {connect.needsReconnect ? (
                    <Button loading={busy === "connect"} onClick={() => void startConnect()}>
                      Connect again
                    </Button>
                  ) : (
                    <Button variant="soft" size="sm" icon={RefreshCw} loading={busy === "sync"} disabled={!!busy} onClick={() => void connection("sync", "POST", { action: "sync" })}>
                      Send now
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => void disconnect()} data-testid="ads-connect-off">
                    Disconnect
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* ── what Google is told ── */}
        <section className="ds-rise" style={{ ["--ds-i" as string]: 1 }}>
          <SectionTitle info="Payments from the last 90 days by leads who reached your website through a Google ad. Google only accepts a payment within 90 days of the ad click. A deposit and the balance are reported as two payments.">
            {linked || status.enabled ? "What Google is being told" : "What Google would be told"}
          </SectionTitle>
          <Card className="grid grid-cols-3 divide-x divide-[color:var(--ds-line)]" data-testid="ads-feed-numbers">
            <div className="px-4 py-3.5 lg:px-5 lg:py-4">
              <p className="ds-num text-xl font-semibold text-[color:var(--ds-ink)] lg:text-2xl">{status.adLeads}</p>
              <p className="ds-small mt-0.5 flex items-center gap-1">
                Ad leads
                <InfoTip>Leads from the last 90 days who arrived on a Google ad click.</InfoTip>
              </p>
            </div>
            <div className="px-4 py-3.5 lg:px-5 lg:py-4">
              <p className="ds-num text-xl font-semibold text-[color:var(--ds-ink)] lg:text-2xl">{status.payments}</p>
              <p className="ds-small mt-0.5 flex items-center gap-1">
                {status.payments === 1 ? "Payment" : "Payments"}
                {leftOut > 0 && (
                  <InfoTip>
                    {status.tooLate > 0 && `${status.tooLate} more left out: the ad click was over 90 days ago. `}
                    {status.noClickId > 0 && `${status.noClickId} more left out: the click came from an iPhone that hides the click ID.`}
                  </InfoTip>
                )}
              </p>
            </div>
            <div className="px-4 py-3.5 lg:px-5 lg:py-4">
              <p className="ds-num text-xl font-semibold text-[color:var(--ds-ink)] lg:text-2xl">{money(status.value)}</p>
              <p className="ds-small mt-0.5">Collected</p>
            </div>
          </Card>
        </section>

        {/* ── by hand: the file Google fetches ── */}
        <section className="ds-rise" style={{ ["--ds-i" as string]: 2 }}>
          {connect.available ? (
            <button type="button" className="mb-3 flex w-full items-center justify-between gap-3 text-left" aria-expanded={handOpen} onClick={() => setHandOpen((v) => !v)} data-testid="ads-hand-toggle">
              <span className="ds-h2">Set it up by hand instead</span>
              <ChevronDown size={18} className={`shrink-0 text-[color:var(--ds-muted)] transition-transform ${handOpen ? "rotate-180" : ""}`} aria-hidden />
            </button>
          ) : (
            <SectionTitle
              info="You do this once, in your Google Ads account, on a computer. WorkBench keeps a private file of the payments and Google Ads fetches it every day. Google moves its menus around now and then: if a name here doesn't match your screen, look for the closest one, or ask us below."
              action={<ActionLink href="/app/help/report-paid-jobs-to-google-ads">Help guide</ActionLink>}
            >
              Set it up in Google Ads
            </SectionTitle>
          )}

          {handOpen && (
            <div className="space-y-4">
              {/* the file's own switch */}
              <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center" data-testid="ads-feed-status">
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  {status.enabled ? <Chip tone="good">File on</Chip> : <Chip>File off</Chip>}
                  <span className="min-w-0 text-[14.5px] text-[color:var(--ds-ink)]">
                    {!status.enabled ? "Turn the file on to get its address." : status.fetchedAt ? `Last fetched ${at(status.fetchedAt)}` : "Nothing has fetched it yet."}
                  </span>
                  {status.enabled && <InfoTip>Each time Google Ads, or anyone with the address, reads the file, the time shows here. Once Google is set up it should move forward every day.</InfoTip>}
                </div>
                {!status.enabled ? (
                  <Button variant={connect.available ? "soft" : "primary"} loading={busy === "on"} onClick={() => void feed("on", "POST")} data-testid="ads-feed-on">
                    Turn on
                  </Button>
                ) : (
                  <div className="flex flex-wrap items-center gap-1">
                    <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => void newAddress()}>
                      New address
                    </Button>
                    <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => void turnOff()} data-testid="ads-feed-off">
                      Turn off
                    </Button>
                  </div>
                )}
              </Card>

              {status.enabled && status.url && (
                <>
                  {/* Part 1: the conversion action */}
                  <Card className="overflow-hidden" data-testid="ads-part-action">
                    <div className="border-b border-[color:var(--ds-line)] px-4 py-3.5 lg:px-5">
                      <h3 className="flex items-center gap-1.5 text-[15px] font-semibold text-[color:var(--ds-ink)]">
                        Part 1 · Create the conversion action
                        <InfoTip>A conversion action is the line in Google Ads that your paid jobs are counted under. Google&apos;s own assistant, Advisor, can make it for you from one message.</InfoTip>
                      </h3>
                    </div>
                    <div className="space-y-3 px-4 py-4 text-[14px] leading-relaxed text-[color:var(--ds-ink)] lg:px-5">
                      <p>
                        In Google Ads, open <strong>Advisor</strong>, paste this message and send it. When it shows what it will create, press <strong>Apply</strong>.
                      </p>
                      <div className="rounded-[12px] bg-[color:var(--ds-surface-2)] px-3.5 py-3">
                        <p className="whitespace-pre-line text-[13px] leading-relaxed text-[color:var(--ds-ink)]" data-testid="ads-advisor-prompt">
                          {ADS_ADVISOR_PROMPT}
                        </p>
                        <Button variant="soft" size="sm" className="mt-2.5" icon={copied === "prompt" ? Check : Copy} onClick={() => void copy("prompt", ADS_ADVISOR_PROMPT)}>
                          {copied === "prompt" ? "Copied" : "Copy message"}
                        </Button>
                      </div>
                      <button type="button" className="ds-link flex items-center gap-1 text-[13.5px]" aria-expanded={actionByHand} onClick={() => setActionByHand((v) => !v)} data-testid="ads-action-by-hand">
                        No Advisor in your account? Do it by hand
                        <ChevronDown size={15} className={`transition-transform ${actionByHand ? "rotate-180" : ""}`} aria-hidden />
                      </button>
                    </div>
                    {actionByHand && (
                      <ol className="ds-divide border-t border-[color:var(--ds-line)]">
                        {step(
                          1,
                          "Check that auto-tagging is on",
                          <p>
                            Open <strong>Admin</strong>, then <strong>Account settings</strong>, then <strong>Auto-tagging</strong>, and make sure the box is ticked. It is what lets WorkBench see which ad click a lead came from.
                          </p>
                        )}
                        {step(
                          2,
                          "Start a new conversion action",
                          <p>
                            Open <strong>Goals</strong>, then <strong>Summary</strong>, and press <strong>New conversion action</strong>. Choose <strong>Import</strong>, then <strong>CRMs, files, or other data sources</strong>, then <strong>Track conversions from clicks</strong>. If Google asks for a data source here, choose to set it up later.
                          </p>
                        )}
                        {step(
                          3,
                          "Fill it in",
                          <>
                            <p>
                              Goal: <strong>Converted lead</strong>. Value: <strong>use different values for each conversion</strong>. Count: <strong>Every</strong>. Give it exactly this name, then save.
                            </p>
                            {field("name", "Conversion action name", status.conversionName, "The name has to match exactly. The file uses it to tell Google which conversion action each payment belongs to.")}
                          </>
                        )}
                      </ol>
                    )}
                  </Card>

                  {/* Part 2: the file connection, Google's screens in order */}
                  <Card className="overflow-hidden" data-testid="ads-part-file">
                    <div className="border-b border-[color:var(--ds-line)] px-4 py-3.5 lg:px-5">
                      <h3 className="flex items-center gap-1.5 text-[15px] font-semibold text-[color:var(--ds-ink)]">
                        Part 2 · Connect the file
                        <InfoTip>Advisor can&apos;t do this part, so it is five short screens in Google Ads. Every value you need has a Copy button here.</InfoTip>
                      </h3>
                    </div>
                    <ol className="ds-divide">
                      {step(
                        1,
                        "Choose the source",
                        <p>
                          In Google Ads open <strong>Tools</strong>, then <strong>Data manager</strong>, and press <strong>Connect a data source</strong>. Search for <strong>HTTPS</strong> and pick it. Choose <strong>Direct connection</strong> and the use <strong>Conversions</strong>.
                        </p>
                      )}
                      {step(
                        2,
                        "Connect a source",
                        <>
                          <p>
                            Paste these three. If Google asks how to sign in, choose <strong>Basic authentication</strong>. Then press <strong>Next</strong>.
                          </p>
                          {field("url", "File address", status.url, "Private to your company. Anyone with it can read the file, which holds ad click IDs, amounts and times. It never holds names, emails, phone numbers or addresses.")}
                          <div className="grid gap-3 sm:grid-cols-2">
                            {field("user", "User name", status.username, "Google asks for a user name and a password. The address is the real key, so these are the same for everyone.")}
                            {field("pass", "Password", status.password)}
                          </div>
                        </>
                      )}
                      {step(
                        3,
                        "Select data",
                        <>
                          <p>
                            Google shows <strong>conversions.csv</strong> as the selected data. Leave Filter alone and press <strong>Next</strong>.
                          </p>
                          {status.payments === 0 && (
                            <div className="rounded-[12px] bg-[color:var(--ds-surface-2)] px-3.5 py-3" data-testid="ads-feed-sample">
                              <p className="flex items-start gap-1.5">
                                <span className="min-w-0 flex-1">
                                  {status.sampleUntil ? (
                                    <>
                                      A sample row is in the file until <strong>{at(status.sampleUntil, false)}</strong>. If Next was grey, press <strong>Replace</strong> in Google, choose the file again, and Next will work.
                                    </>
                                  ) : (
                                    <>
                                      <strong>Next is grey?</strong> Your file has no payments in it yet, and Google can&apos;t read an empty file. Add a sample row, then press <strong>Replace</strong> in Google and choose the file again.
                                    </>
                                  )}
                                </span>
                                <InfoTip>
                                  The sample row is one made-up payment of $1.00 with a click ID that isn&apos;t real. It stays for {ADS_SAMPLE_HOURS} hours, or until a real payment is in the file. Google can&apos;t match it to an ad, so it counts nothing. If Google fetches during that time it will list one row it couldn&apos;t match. That is the sample.
                                </InfoTip>
                              </p>
                              {!status.sampleUntil && (
                                <Button variant="soft" size="sm" className="mt-2.5" loading={busy === "sample"} onClick={() => void feed("sample", "POST", { action: "sample" })} data-testid="ads-feed-sample-add">
                                  Add a sample row
                                </Button>
                              )}
                            </div>
                          )}
                        </>
                      )}
                      {step(
                        4,
                        "Map fields",
                        <>
                          <p>Google lists its fields and asks which column of the file goes with each. Pick these:</p>
                          <div className="overflow-hidden rounded-[12px] border border-[color:var(--ds-line)]">
                            <table className="w-full text-[13.5px]">
                              <thead>
                                <tr className="border-b border-[color:var(--ds-line)] text-left text-[12.5px] text-[color:var(--ds-muted)]">
                                  <th className="px-3.5 py-2 font-medium">Google&apos;s field</th>
                                  <th className="px-3.5 py-2 font-medium">Column in the file</th>
                                </tr>
                              </thead>
                              <tbody className="ds-divide">
                                {ADS_FIELD_MAP.map((m) => (
                                  <tr key={m.column}>
                                    <td className="px-3.5 py-2">
                                      {m.google}
                                      {m.note && <span className="text-[color:var(--ds-muted)]"> ({m.note})</span>}
                                    </td>
                                    <td className="px-3.5 py-2">
                                      <code className="text-[13px]">{m.column}</code>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <p>
                            Leave every other field empty. The times already carry their time zone, so no time zone setting is needed. Press <strong>Next</strong>.
                          </p>
                        </>
                      )}
                      {step(
                        5,
                        "Schedule and finish",
                        <p>
                          Set it to run <strong>every day</strong>, give the connection a name such as WorkBench conversions, then press <strong>Finish</strong>.
                        </p>
                      )}
                    </ol>
                    <p className="border-t border-[color:var(--ds-line)] px-4 py-3.5 text-[13.5px] text-[color:var(--ds-muted)] lg:px-5">
                      Done? The &quot;Last fetched&quot; time above moves forward each time Google reads the file. Payments show in Google Ads about a day after that.
                    </p>
                  </Card>
                </>
              )}
            </div>
          )}
        </section>

        {/* ── the failsafe: a person ── */}
        <Card className="ds-rise flex flex-col gap-4 p-5 sm:flex-row sm:items-center" style={{ ["--ds-i" as string]: 3 }} data-testid="ads-help">
          <p className="min-w-0 flex-1 text-[14.5px] text-[color:var(--ds-ink)]">
            <strong>Stuck?</strong> We&apos;ll set it up with you.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="soft" size="sm" icon={LifeBuoy} loading={busy === "help"} onClick={() => void askForHelp()} data-testid="ads-help-ask">
              Ask for help
            </Button>
            <a href={SETUP_CALL_PATH} target="_blank" rel="noopener" className="ds-btn ds-btn-outline ds-btn-sm">
              <PhoneCall size={15} strokeWidth={2.2} aria-hidden />
              {SETUP_CALL_LABEL}
            </a>
          </div>
        </Card>
      </div>
    </DsPage>
  );
}
