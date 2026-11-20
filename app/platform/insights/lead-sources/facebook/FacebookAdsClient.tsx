"use client";

import { useState } from "react";
import { LifeBuoy, PhoneCall, RefreshCw } from "lucide-react";
import BackLink from "@/components/BackLink";
import { Button, Card, Chip, DsPage, InfoTip, PageHeader, SectionTitle } from "@/components/ds";
import { Input } from "@/components/Input";
import { alertSheet, confirmSheet, promptSheet } from "@/components/ConfirmSheet";
import { postJson } from "@/lib/safe-fetch";
import { SETUP_CALL_LABEL, SETUP_CALL_PATH } from "@/lib/setup-call";
import { META_STEPS } from "@/lib/meta-ads-shape";
import type { MetaAdsStatus } from "@/lib/meta-ads";

/**
 * Facebook ads. Laid out like the Google Ads page beside it
 * (docs/design-system.md): the thing to do first, explanations in (i) bubbles.
 *
 *   Tell Facebook which leads became jobs — off: three steps and two boxes to
 *     paste into. On: the dataset, when steps last went, Send now, a test
 *     event, Turn off.
 *   What Facebook is being told — the numbers.
 *   Stuck? — ask WorkBench for help from right here, or book a setup call.
 */
export default function FacebookAdsClient({ initial, timeZone }: { initial: MetaAdsStatus; timeZone: string }) {
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [datasetId, setDatasetId] = useState("");
  const [token, setToken] = useState("");
  const [testCode, setTestCode] = useState("");
  // the two boxes show while off, and again when the owner asks to replace the token
  const [editing, setEditing] = useState(false);
  const showForm = !status.on || editing;

  async function call(key: string, method: "POST" | "DELETE", body?: unknown): Promise<(MetaAdsStatus & { tested?: boolean }) | null> {
    setBusy(key);
    setError(null);
    setNotice(null);
    const { ok, data } = await postJson<MetaAdsStatus & { tested?: boolean }>("/api/app/meta-ads", body, method);
    setBusy(null);
    if (!ok || !data) {
      setError(data?.error ?? "That didn't work. Try again.");
      return null;
    }
    setStatus(data);
    return data;
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
    if (next) setNotice("Test event sent. It shows on the Test events tab in Events Manager within a minute.");
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
        {/* ── results back ── */}
        <section className="ds-rise">
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
                      <InfoTip>In Events Manager open your dataset, then the Test events tab. Under the server option it shows a code such as TEST12345. A test event counts nothing and reaches no ad.</InfoTip>
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
                  <p>
                    On a computer, go to <strong>business.facebook.com/events_manager</strong> and pick the dataset your ads use (Facebook also calls it a pixel). No dataset yet? Press <strong>Connect data</strong>, choose <strong>Web</strong> and name it.
                  </p>
                )}
                {step(
                  2,
                  "Copy the dataset ID",
                  <>
                    <p>
                      Open the <strong>Settings</strong> tab. The <strong>Dataset ID</strong> is the long number near the top.
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
                      On the same tab, scroll to <strong>Conversions API</strong> and press <strong>Generate access token</strong>. Copy the whole token: Facebook shows it once.
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
        <section className="ds-rise" style={{ ["--ds-i" as string]: 1 }}>
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
        <Card className="ds-rise flex flex-col gap-4 p-5 sm:flex-row sm:items-center" style={{ ["--ds-i" as string]: 2 }} data-testid="fb-help">
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
