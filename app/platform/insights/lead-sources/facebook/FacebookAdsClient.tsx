"use client";

import { useEffect, useState } from "react";
import { LifeBuoy, PhoneCall, RefreshCw } from "lucide-react";
import BackLink from "@/components/BackLink";
import { Button, Card, Chip, DsPage, InfoTip, PageHeader, SectionTitle } from "@/components/ds";
import { Input } from "@/components/Input";
import { alertSheet, confirmSheet, promptSheet } from "@/components/ConfirmSheet";
import { getCapacitor } from "@/components/NativeShell";
import { postJson } from "@/lib/safe-fetch";
import { SETUP_CALL_LABEL, SETUP_CALL_PATH } from "@/lib/setup-call";
import { META_STEPS } from "@/lib/meta-ads-shape";
import type { MetaAdsStatus } from "@/lib/meta-ads";
import type { MetaLeadsStatus } from "@/lib/meta-leads";

/**
 * Facebook ads. Laid out like the Google Ads page beside it
 * (docs/design-system.md): the thing to do first, explanations in (i) bubbles.
 *
 *   Get leads from Facebook forms — Connect Facebook, one sign-in (only when
 *     the server has it set up). Connected: the Page, when a lead last came,
 *     Disconnect.
 *   Tell Facebook which leads became jobs — off: three steps and two boxes to
 *     paste into. On: the dataset, when steps last went, Send now, a test
 *     event, Turn off.
 *   What Facebook is being told — the numbers.
 *   Stuck? — ask WorkBench for help from right here, or book a setup call.
 */
type Page = { id: string; name: string };
type LeadsData = MetaLeadsStatus & { pages?: Page[] };

const OUTCOMES: Record<string, { tone: "ok" | "err"; text: string }> = {
  connected: { tone: "ok", text: "Facebook is connected. Leads from your Facebook and Instagram forms land on your Leads board from now on." },
  pick_page: { tone: "ok", text: "Signed in. Pick the Facebook Page your lead forms are on." },
  no_pages: { tone: "err", text: "That Facebook sign-in has no Page it can advertise for. Sign in as someone who manages your business's Page." },
  denied: { tone: "err", text: "Facebook connection cancelled. Nothing was changed." },
  expired: { tone: "err", text: "That connection link expired. Press Connect Facebook again." },
  failed: { tone: "err", text: "Facebook didn't complete the connection." },
};

export default function FacebookAdsClient({
  initial,
  initialLeads,
  timeZone,
  outcome,
  outcomeWhy,
}: {
  initial: MetaAdsStatus;
  initialLeads: MetaLeadsStatus;
  timeZone: string;
  outcome: string | null;
  outcomeWhy: string | null;
}) {
  const [status, setStatus] = useState(initial);
  const [leads, setLeads] = useState<LeadsData>(initialLeads);
  const flash = outcome ? OUTCOMES[outcome] ?? null : null;

  // several Pages under one sign-in: fetch the list to pick from
  useEffect(() => {
    if (!initialLeads.needsPage) return;
    let live = true;
    fetch("/api/app/meta-leads", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: LeadsData | null) => {
        if (live && d) setLeads(d);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [initialLeads.needsPage]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [datasetId, setDatasetId] = useState("");
  const [token, setToken] = useState("");
  const [testCode, setTestCode] = useState("");
  // the two boxes show while off, and again when the owner asks to replace the token
  const [editing, setEditing] = useState(false);
  const showForm = !status.on || editing;

  type Answer = { received: number | null; messages: string[]; trace: string | null; datasetId: string };
  type CallResult = MetaAdsStatus & { tested?: boolean; facebook?: Answer };

  async function call(key: string, method: "POST" | "DELETE", body?: unknown): Promise<CallResult | null> {
    setBusy(key);
    setError(null);
    setNotice(null);
    const { ok, data } = await postJson<CallResult>("/api/app/meta-ads", body, method);
    setBusy(null);
    if (!ok || !data) {
      setError(data?.error ?? "That didn't work. Try again.");
      return null;
    }
    setStatus(data);
    return data;
  }

  async function connection(key: string, method: "POST" | "DELETE", body?: unknown) {
    setBusy(key);
    setError(null);
    setNotice(null);
    const { ok, data } = await postJson<LeadsData>("/api/app/meta-leads", body, method);
    setBusy(null);
    if (!ok || !data) setError(data?.error ?? "That didn't work. Try again.");
    else setLeads(data);
  }

  /** Facebook's screen can't load inside the phone app, so there it opens in the system browser (same as Google Ads). */
  async function startConnect() {
    const browser = getCapacitor()?.Plugins?.Browser;
    if (!browser?.open) {
      window.location.assign("/api/app/integrations/meta/connect");
      return;
    }
    setBusy("connect");
    try {
      const res = await fetch("/api/app/integrations/meta/connect?mode=url");
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) setError(data?.error ?? "Couldn't reach Facebook. Try again.");
      else await browser.open({ url: data.url });
    } catch {
      setError("Couldn't reach Facebook. Check your connection and try again.");
    }
    setBusy(null);
  }

  async function disconnect() {
    const yes = await confirmSheet({
      title: "Disconnect Facebook?",
      message: "Leads from your Facebook forms stop arriving in WorkBench. Leads already on your board stay.",
      confirmLabel: "Disconnect",
      destructive: true,
    });
    if (yes) void connection("disconnect", "DELETE");
  }

  async function save() {
    const next = await call("save", "POST", { datasetId, token });
    if (!next) return;
    setEditing(false);
    setToken("");
    setNotice("Saved. Send a test event below to see it arrive in Events Manager.");
  }

  async function sendNow() {
    const before = status.waiting;
    const next = await call("sync", "POST", { action: "sync" });
    if (next) setNotice(before === 0 ? "Nothing new to send right now." : `Sent ${before - next.waiting} ${before - next.waiting === 1 ? "step" : "steps"} to Facebook.`);
  }

  async function test() {
    const next = await call("test", "POST", { action: "test", testCode });
    if (!next) return;
    const f = next.facebook;
    const took = f?.received === 0 ? "Facebook answered but took 0 events." : `Facebook accepted the test event for dataset ${f?.datasetId ?? status.datasetId}.`;
    const said = f?.messages.length ? ` Facebook also said: ${f.messages.join(" ")}` : "";
    setNotice(`${took}${said} Keep the Test events tab of that same dataset open: it shows there within a minute. Not there? The code must come from that dataset's tab, and an ad blocker can hide the list.${f?.trace ? ` (Facebook reference ${f.trace})` : ""}`);
  }

  async function turnOff() {
    const yes = await confirmSheet({
      title: "Stop reporting to Facebook?",
      message: "WorkBench stops telling Facebook what your leads did. What Facebook has already counted stays counted.",
      confirmLabel: "Turn off",
      destructive: true,
    });
    if (!yes) return;
    const next = await call("off", "DELETE");
    if (next) {
      setEditing(false);
      setDatasetId("");
      setToken("");
    }
  }

  /** The failsafe: one tap sends WorkBench a help request from this page, with where the setup stands. */
  async function askForHelp() {
    const note = await promptSheet({
      title: "Ask WorkBench for help",
      message: "Tell us where you got stuck. We'll reply by email and can do the setup with you.",
      placeholder: "For example: I can't find Generate access token",
      confirmLabel: "Send",
    });
    if (note === null) return;
    setBusy("help");
    const where = [
      leads.available ? (leads.connected ? `Lead forms: connected to ${leads.pageName}${leads.needsReconnect ? ", needs reconnect" : ""}, ${leads.unread} unread` : leads.needsPage ? "Lead forms: signed in, no Page picked" : "Lead forms: not connected") : "Lead forms: not offered",
      leads.lastLeadError ? `Last lead error: ${leads.lastLeadError}` : "",
      `Reporting: ${status.on ? (status.needsToken ? "on, token refused" : "on") : "off"}${status.lastSendAt ? `, last sent ${status.lastSendAt}` : ", nothing sent yet"}`,
      status.lastError ? `Last Facebook error: ${status.lastError}` : "",
      `Facebook leads ${status.facebookLeads}, steps this week ${status.sentThisWeek}, waiting ${status.waiting}`,
    ]
      .filter(Boolean)
      .join("\n");
    const { ok, data } = await postJson("/api/app/feedback", {
      type: "BUG",
      title: "Help setting up Facebook ads",
      details: `${note.trim() || "(no note)"}\n\n${where}`,
      pageUrl: "Facebook ads",
    });
    setBusy(null);
    if (ok) await alertSheet({ title: "Sent", message: "We got it. We'll reply by email, usually within one business day." });
    else setError((data as { error?: string } | null)?.error ?? "That didn't send. Try again, or book a setup call.");
  }

  const at = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone });

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
          title="Facebook ads"
          info="When a lead who came from Facebook or Instagram books, gets a quote, becomes a job or pays, Facebook can be told. Its ads then go after people who turn into paid work, not only people who fill in a form."
        />
      </div>

      {flash && !error && !notice && (
        <div role="status" className={flash.tone === "ok" ? "mt-5 rounded-[12px] bg-[color:var(--ds-surface-2)] px-3.5 py-3 text-[14px] text-[color:var(--ds-ink)]" : "form-error mt-5"} data-testid="fb-connect-outcome">
          {flash.text}
          {flash.tone === "err" && outcomeWhy ? ` Facebook said: ${outcomeWhy}` : ""}
        </div>
      )}
      {notice && !error && (
        <div role="status" className="mt-5 rounded-[12px] bg-[color:var(--ds-surface-2)] px-3.5 py-3 text-[14px] text-[color:var(--ds-ink)]" data-testid="fb-notice">
          {notice}
        </div>
      )}
      {error && (
        <div role="alert" className="form-error mt-5" data-testid="fb-error">
          {error}
        </div>
      )}

      <div className="mt-6 space-y-8">
        {/* ── lead forms in: sign in with Facebook and leads arrive by themselves ── */}
        {leads.available && (
          <section className="ds-rise">
            <SectionTitle info="When someone fills in a lead form on one of your Facebook or Instagram ads, Facebook tells WorkBench and the lead lands on your Leads board in seconds, with the same alert a website lead gets. No Zapier, no downloading spreadsheets.">
              Get leads from Facebook forms
            </SectionTitle>
            <Card className="p-5" data-testid="fb-connect">
              {!leads.connected && !leads.needsPage ? (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <p className="flex min-w-0 flex-1 items-start gap-1.5 text-[14.5px] text-[color:var(--ds-ink)]">
                    <span className="min-w-0">Sign in with the Facebook account that manages your business&apos;s Page.</span>
                    <InfoTip>Facebook asks you to let WorkBench read the leads from your Page&apos;s forms. WorkBench uses that for nothing else: it doesn&apos;t post, message anyone, or touch your ads or budgets.</InfoTip>
                  </p>
                  <Button loading={busy === "connect"} onClick={() => void startConnect()} data-testid="fb-connect-start">
                    Connect Facebook
                  </Button>
                </div>
              ) : leads.needsPage ? (
                <div>
                  <p className="text-[14.5px] font-semibold text-[color:var(--ds-ink)]">Which Facebook Page?</p>
                  {leads.fbUserName && <p className="ds-small mt-0.5">Signed in as {leads.fbUserName}</p>}
                  {leads.lastLeadError && <p className="mt-2 text-[13.5px] text-[color:var(--ds-bad)]">{leads.lastLeadError}</p>}
                  <ul className="ds-divide mt-3 overflow-hidden rounded-[12px] border border-[color:var(--ds-line)]">
                    {(leads.pages ?? []).map((p) => (
                      <li key={p.id} className="flex items-center gap-3 px-3.5 py-2.5">
                        <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium text-[color:var(--ds-ink)]">{p.name}</span>
                        <Button variant="soft" size="sm" loading={busy === `pick-${p.id}`} disabled={!!busy} onClick={() => void connection(`pick-${p.id}`, "POST", { pageId: p.id })}>
                          Use this one
                        </Button>
                      </li>
                    ))}
                    {(leads.pages ?? []).length === 0 && <li className="ds-small px-3.5 py-3">Reading your Facebook Pages…</li>}
                  </ul>
                  <Button variant="ghost" size="sm" className="mt-3" disabled={!!busy} onClick={() => void disconnect()}>
                    Disconnect
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      {leads.needsReconnect || leads.lastLeadError ? <Chip tone="bad">Needs you</Chip> : <Chip tone="good">Connected</Chip>}
                      <span className="min-w-0 truncate text-[14.5px] font-medium text-[color:var(--ds-ink)]">{leads.pageName}</span>
                    </div>
                    <p className="ds-small mt-1">
                      {leads.needsReconnect
                        ? "Facebook no longer accepts this sign-in. Connect again to keep leads arriving."
                        : leads.lastLeadAt
                          ? `Last lead ${at(leads.lastLeadAt)} · ${leads.leads30} in the last 30 days`
                          : "Waiting for your first lead."}
                    </p>
                    {leads.lastLeadError && !leads.needsReconnect && <p className="mt-1.5 text-[13.5px] text-[color:var(--ds-bad)]">{leads.lastLeadError}</p>}
                    {leads.unread > 0 && (
                      <p className="mt-1.5 flex items-start gap-1 text-[13.5px] text-[color:var(--ds-bad)]">
                        <span className="min-w-0">
                          {leads.unread} {leads.unread === 1 ? "lead" : "leads"} Facebook told us about couldn&apos;t be read yet.
                        </span>
                        <InfoTip>WorkBench tries again every hour. If it stays, your leads are still in Facebook: open the form in Meta Business Suite to see them.</InfoTip>
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {leads.needsReconnect && (
                      <Button loading={busy === "connect"} onClick={() => void startConnect()}>
                        Connect again
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => void disconnect()} data-testid="fb-connect-off">
                      Disconnect
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </section>
        )}

        {/* ── results back ── */}
        <section className="ds-rise" style={{ ["--ds-i" as string]: 1 }}>
          <SectionTitle
            info={
              <>
                WorkBench sends Facebook the step, its time and the amount of a payment, matched by Facebook&apos;s own click ID or lead ID. It never sends a name, email, phone number or address, and it doesn&apos;t touch your campaigns or budgets. Steps:{" "}
                {META_STEPS.map((s) => s.label.toLowerCase()).join(", ")}.
              </>
            }
          >
            Tell Facebook which leads became jobs
          </SectionTitle>

          {status.on && (
            <Card className="p-5" data-testid="fb-status">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5">
                    {status.needsToken ? <Chip tone="bad">Needs you</Chip> : <Chip tone="good">On</Chip>}
                    <span className="ds-num min-w-0 truncate text-[14.5px] font-medium text-[color:var(--ds-ink)]">Dataset {status.datasetId}</span>
                  </div>
                  <p className="ds-small mt-1">
                    {status.needsToken
                      ? "Facebook no longer accepts this access token. Generate a new one in Events Manager and paste it here."
                      : status.lastSendAt
                        ? `Last sent ${at(status.lastSendAt)} · ${status.lastSendCount ?? 0} ${status.lastSendCount === 1 ? "step" : "steps"}`
                        : "Nothing to send yet. Steps go out within the hour after a Facebook lead takes one."}
                  </p>
                  {status.lastError && <p className="mt-1.5 text-[13.5px] text-[color:var(--ds-bad)]">Facebook said: {status.lastError}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {status.needsToken ? (
                    <Button onClick={() => setEditing(true)} disabled={editing}>
                      New token
                    </Button>
                  ) : (
                    <Button variant="soft" size="sm" icon={RefreshCw} loading={busy === "sync"} disabled={!!busy} onClick={() => void sendNow()} data-testid="fb-send-now">
                      Send now
                    </Button>
                  )}
                  {!status.needsToken && !editing && (
                    <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => setEditing(true)}>
                      Change
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => void turnOff()} data-testid="fb-off">
                    Turn off
                  </Button>
                </div>
              </div>

              {!status.needsToken && !editing && (
                <div className="mt-4 flex flex-col gap-2 border-t border-[color:var(--ds-line)] pt-4 sm:flex-row sm:items-end">
                  <label className="min-w-0 flex-1">
                    <span className="ds-label flex items-center gap-1">
                      Test code
                      <InfoTip>In Events Manager open this same dataset, then its Test events tab, and leave that tab open. It shows a code such as TEST12345. A test event counts nothing and reaches no ad.</InfoTip>
                    </span>
                    <Input className="mt-1 w-full" value={testCode} onChange={(e) => setTestCode(e.target.value)} placeholder="TEST12345" autoCapitalize="characters" autoComplete="off" data-testid="fb-test-code" />
                  </label>
                  <Button variant="outline" size="sm" loading={busy === "test"} disabled={!!busy || !testCode.trim()} onClick={() => void test()} data-testid="fb-test">
                    Send a test event
                  </Button>
                </div>
              )}
            </Card>
          )}

          {showForm && (
            <Card className={`overflow-hidden ${status.on ? "mt-3" : ""}`} data-testid="fb-setup">
              <ol className="ds-divide">
                {step(
                  1,
                  "Open your dataset in Events Manager",
                  <>
                  <p>
                    On a computer, go to <strong>business.facebook.com/events_manager</strong> and pick the dataset your ads use (Facebook also calls it a pixel). No dataset yet? Press <strong>Connect data</strong>, choose <strong>Web</strong> and name it. When Facebook then asks you to install the Meta Pixel on your website, press <strong>Cancel</strong>: WorkBench doesn&apos;t use that code.
                  </p>
                  <p className="flex items-start gap-1 text-[13.5px] text-[color:var(--ds-muted)]">
                    <span className="min-w-0">The dataset has to belong to a business portfolio you fully control.</span>
                    <InfoTip>Facebook only lets an admin of a business portfolio make the access token. A dataset made under a personal ad account has no portfolio. At business.facebook.com create a portfolio (it&apos;s free), then under Settings, Data sources, Datasets add a dataset there and use that one.</InfoTip>
                  </p>
                  </>
                )}
                {step(
                  2,
                  "Copy the dataset ID",
                  <>
                    <p>
                      The <strong>ID</strong> is the long number under the dataset&apos;s name at the top of the page.
                    </p>
                    <label className="block">
                      <span className="ds-label">Dataset ID</span>
                      <Input className="mt-1 w-full" inputMode="numeric" value={datasetId} onChange={(e) => setDatasetId(e.target.value)} placeholder={status.datasetId ?? "1234567890123456"} autoComplete="off" data-testid="fb-dataset" />
                    </label>
                  </>
                )}
                {step(
                  3,
                  "Generate an access token",
                  <>
                    <p>
                      Open the dataset&apos;s <strong>Settings</strong> tab and scroll down past Conversions API to <strong>Set up direct integration</strong>. Press <strong>Generate access token</strong> there and copy the whole token: Facebook shows it once.
                    </p>
                    <label className="block">
                      <span className="ds-label flex items-center gap-1">
                        Access token
                        <InfoTip>The token only lets WorkBench add events to this one dataset. It can&apos;t read your ads, spend money or post anything. WorkBench stores it encrypted and never shows it again.</InfoTip>
                      </span>
                      <Input className="mt-1 w-full" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste the token" autoComplete="off" data-testid="fb-token" />
                    </label>
                  </>
                )}
              </ol>
              <div className="flex flex-wrap items-center gap-2 border-t border-[color:var(--ds-line)] px-4 py-3.5 lg:px-5">
                <Button loading={busy === "save"} disabled={!!busy || !datasetId.trim() || !token.trim()} onClick={() => void save()} data-testid="fb-save">
                  {status.on ? "Save" : "Turn on"}
                </Button>
                {status.on && (
                  <Button variant="ghost" disabled={!!busy} onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                )}
              </div>
            </Card>
          )}
        </section>

        {/* ── what Facebook is told ── */}
        <section className="ds-rise" style={{ ["--ds-i" as string]: 2 }}>
          <SectionTitle info="Facebook only accepts a step within 7 days of when it happened, so WorkBench sends each one within the hour. A step that happened before you turned this on, more than 7 days back, is never sent.">
            {status.on ? "What Facebook is being told" : "What Facebook would be told"}
          </SectionTitle>
          <Card className="grid grid-cols-3 divide-x divide-[color:var(--ds-line)]" data-testid="fb-numbers">
            <div className="px-4 py-3.5 lg:px-5 lg:py-4">
              <p className="ds-num text-xl font-semibold text-[color:var(--ds-ink)] lg:text-2xl">{status.facebookLeads}</p>
              <p className="ds-small mt-0.5 flex items-center gap-1">
                Facebook leads
                <InfoTip>Leads from the last 90 days who reached your website from Facebook or Instagram, or filled in a Facebook form. Facebook decides which of them came from an ad.</InfoTip>
              </p>
            </div>
            <div className="px-4 py-3.5 lg:px-5 lg:py-4">
              <p className="ds-num text-xl font-semibold text-[color:var(--ds-ink)] lg:text-2xl">{status.sentThisWeek}</p>
              <p className="ds-small mt-0.5">Sent this week</p>
            </div>
            <div className="px-4 py-3.5 lg:px-5 lg:py-4">
              <p className="ds-num text-xl font-semibold text-[color:var(--ds-ink)] lg:text-2xl">{status.waiting}</p>
              <p className="ds-small mt-0.5 flex items-center gap-1">
                {status.on ? "Waiting to send" : "Ready to send"}
                <InfoTip>Steps from the last 7 days that Facebook has not been told about yet.</InfoTip>
              </p>
            </div>
          </Card>
        </section>

        {/* ── the failsafe: a person ── */}
        <Card className="ds-rise flex flex-col gap-4 p-5 sm:flex-row sm:items-center" style={{ ["--ds-i" as string]: 3 }} data-testid="fb-help">
          <p className="min-w-0 flex-1 text-[14.5px] text-[color:var(--ds-ink)]">
            <strong>Stuck?</strong> We&apos;ll set it up with you.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="soft" size="sm" icon={LifeBuoy} loading={busy === "help"} onClick={() => void askForHelp()} data-testid="fb-help-ask">
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
