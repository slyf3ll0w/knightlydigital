"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import BackLink from "@/components/BackLink";
import { ActionLink, Button, Card, Chip, DsPage, InfoTip, PageHeader, SectionTitle } from "@/components/ds";
import { confirmSheet } from "@/components/ConfirmSheet";
import { postJson } from "@/lib/safe-fetch";
import { money } from "@/lib/statuses";
import { ADS_FIELD_MAP, ADS_SAMPLE_HOURS } from "@/lib/ads-conversions";
import type { AdsFeedStatus } from "@/lib/ads-conversions-server";

/**
 * Report paid jobs to Google Ads. Laid out like the rest of the app
 * (docs/design-system.md): the state and the thing to do first, explanations
 * in (i) bubbles. Off = one button. On = the status, what the file holds,
 * then the Google Ads setup as numbered steps that follow Google's own
 * screens, each value to paste sitting in the step that asks for it.
 */
export default function GoogleAdsClient({ initial, timeZone }: { initial: AdsFeedStatus; timeZone: string }) {
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function call(key: string, method: "POST" | "DELETE", body?: unknown) {
    setBusy(key);
    setError(null);
    const { ok, data } = await postJson<AdsFeedStatus>("/api/app/ads-conversions", body, method);
    setBusy(null);
    if (!ok || !data) setError(data?.error ?? "That didn't save. Try again.");
    else setStatus(data);
  }

  async function newAddress() {
    const yes = await confirmSheet({
      title: "Make a new file address?",
      message: "The address Google Ads has now stops working right away. Paste the new one into Google Ads or nothing more is reported.",
      confirmLabel: "Make new address",
      destructive: true,
    });
    if (yes) void call("new", "POST");
  }

  async function turnOff() {
    const yes = await confirmSheet({
      title: "Stop reporting to Google Ads?",
      message: "The file address stops working right away. What Google has already counted stays counted.",
      confirmLabel: "Turn off",
      destructive: true,
    });
    if (yes) void call("off", "DELETE");
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
        <h3 className="text-[14.5px] font-semibold leading-6 text-[color:var(--ds-ink)]">{title}</h3>
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
          info="When a lead who clicked one of your Google ads pays an invoice, Google Ads can be told what that click was worth. Its bidding then goes after clicks that turn into paid work, not only clicks that fill in a form. WorkBench keeps a private file of those payments and Google Ads fetches it on a schedule you set up once."
        />
      </div>

      {error && (
        <div role="alert" className="form-error mt-5">
          {error}
        </div>
      )}

      <div className="mt-6 space-y-8">
        {/* ── where things stand, and the one switch ── */}
        <Card className="ds-rise flex flex-col gap-4 p-5 sm:flex-row sm:items-center" data-testid="ads-feed-status">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              {status.enabled ? <Chip tone="good">On</Chip> : <Chip>Off</Chip>}
              <span className="min-w-0 text-[14.5px] text-[color:var(--ds-ink)]">
                {!status.enabled
                  ? "Turn it on to get the file address for Google Ads."
                  : status.fetchedAt
                    ? `File last fetched ${at(status.fetchedAt)}`
                    : "Nothing has fetched the file yet."}
              </span>
              {status.enabled && (
                <InfoTip>
                  Each time Google Ads, or anyone with the address, reads the file, the time shows here. Once Google is set up it should move forward every day.
                </InfoTip>
              )}
            </div>
          </div>
          {!status.enabled ? (
            <Button loading={busy === "on"} onClick={() => void call("on", "POST")} data-testid="ads-feed-on">
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

        {/* ── what the file holds ── */}
        <section className="ds-rise" style={{ ["--ds-i" as string]: 1 }}>
          <SectionTitle info="Payments from the last 90 days by leads who reached your website through a Google ad. Google only accepts a payment within 90 days of the ad click. A deposit and the balance are reported as two payments.">
            {status.enabled ? "What Google is being told" : "What Google would be told"}
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

        {/* ── the one-time setup, following Google's own screens ── */}
        {status.enabled && status.url && (
          <section className="ds-rise" style={{ ["--ds-i" as string]: 2 }}>
            <SectionTitle
              info="You do this once, in your Google Ads account, on a computer. After that Google fetches the file by itself. Google moves its menus around now and then: if a name here doesn't match your screen, look for the closest one."
              action={<ActionLink href="/app/help/report-paid-jobs-to-google-ads">Help guide</ActionLink>}
            >
              Set it up in Google Ads
            </SectionTitle>
            <Card className="overflow-hidden">
              <ol className="ds-divide">
                {step(
                  1,
                  "Check that auto-tagging is on",
                  <p>
                    In Google Ads open <strong>Admin</strong>, then <strong>Account settings</strong>, then <strong>Auto-tagging</strong>, and make sure the box is ticked. It is what lets WorkBench see which ad click a lead came from.
                  </p>
                )}
                {step(
                  2,
                  "Start a new conversion action",
                  <>
                    <p>
                      Open <strong>Goals</strong>, then <strong>Summary</strong>, and press <strong>New conversion action</strong>. Choose <strong>Import</strong>, then <strong>CRMs, files, or other data sources</strong>, then <strong>Track conversions from clicks</strong>.
                    </p>
                    <p>
                      Under Data source choose <strong>Connect a new data source</strong>, search for <strong>HTTPS</strong> and pick it. If Google asks, choose <strong>Direct connection</strong> and the use <strong>Conversions</strong>. For the goal, pick <strong>Converted lead</strong>.
                    </p>
                  </>
                )}
                {step(
                  3,
                  "Connect a source",
                  <>
                    <p>Google asks where the file is. Paste these three:</p>
                    {field("url", "File address", status.url, "Private to your company. Anyone with it can read the file, which holds ad click IDs, amounts and times. It never holds names, emails, phone numbers or addresses.")}
                    <div className="grid gap-3 sm:grid-cols-2">
                      {field("user", "User name", status.username, "Google asks for a user name and a password. The address is the real key, so these are the same for everyone.")}
                      {field("pass", "Password", status.password)}
                    </div>
                  </>
                )}
                {step(
                  4,
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
                          <Button variant="soft" size="sm" className="mt-2.5" loading={busy === "sample"} onClick={() => void call("sample", "POST", { action: "sample" })} data-testid="ads-feed-sample-add">
                            Add a sample row
                          </Button>
                        )}
                      </div>
                    )}
                  </>
                )}
                {step(
                  5,
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
                    <p>Leave every other field empty. The times already carry their time zone, so no time zone setting is needed. Press <strong>Next</strong>.</p>
                  </>
                )}
                {step(
                  6,
                  "Review and finish",
                  <>
                    <p>
                      Give the connection a name, such as WorkBench paid jobs. Set it to run <strong>every day</strong>, then press <strong>Finish</strong> and <strong>Save and continue</strong>.
                    </p>
                    <p>
                      If Google asks for the conversion action&apos;s name, use this one. For its value, choose to use a different value for each conversion.
                    </p>
                    {field("name", "Conversion action name", status.conversionName)}
                  </>
                )}
                {step(
                  7,
                  "Check it is working",
                  <p>
                    Come back here after Google&apos;s first run: the time at the top of this page moves forward each time Google reads the file. Payments show in Google Ads under the conversion action about a day after Google reads them.
                  </p>
                )}
              </ol>
            </Card>
          </section>
        )}
      </div>
    </DsPage>
  );
}
