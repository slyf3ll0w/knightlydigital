"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import BackLink from "@/components/BackLink";
import { Button, Card, DsPage, InfoTip, PageHeader, SectionTitle } from "@/components/ds";
import { confirmSheet } from "@/components/ConfirmSheet";
import { postJson } from "@/lib/safe-fetch";
import { money } from "@/lib/statuses";
import type { AdsFeedStatus } from "@/lib/ads-conversions-server";

/**
 * Report paid jobs to Google Ads. Laid out like the rest of the app
 * (docs/design-system.md): the thing to do first, explanations in (i)
 * bubbles. Off = one button. On = what Google is being told, then the four
 * values to paste into Google Ads, each with its own Copy.
 */
export default function GoogleAdsClient({ initial, timeZone }: { initial: AdsFeedStatus; timeZone: string }) {
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function call(method: "POST" | "DELETE") {
    setBusy(true);
    setError(null);
    const { ok, data } = await postJson<AdsFeedStatus>("/api/app/ads-conversions", undefined, method);
    setBusy(false);
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
    if (yes) void call("POST");
  }

  async function turnOff() {
    const yes = await confirmSheet({
      title: "Stop reporting to Google Ads?",
      message: "The file address stops working right away. What Google has already counted stays counted.",
      confirmLabel: "Turn off",
      destructive: true,
    });
    if (yes) void call("DELETE");
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

  const fetched = status.fetchedAt
    ? new Date(status.fetchedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone })
    : null;
  const eyebrow = !status.enabled ? "Off" : fetched ? `On · file last fetched ${fetched}` : "On · not fetched yet";
  const leftOut = status.tooLate + status.noClickId;

  const values: { key: string; label: string; value: string; info?: string }[] = status.url
    ? [
        { key: "url", label: "File address", value: status.url, info: "Private to your company. Anyone with it can read the file, which holds ad click IDs, amounts and times. It never holds names, emails, phone numbers or addresses." },
        { key: "user", label: "User name", value: status.username, info: "Google asks for a user name and a password. The address is the real key, so these are the same for everyone." },
        { key: "pass", label: "Password", value: status.password },
        { key: "name", label: "Conversion action name", value: status.conversionName, info: "The conversion action in Google Ads has to carry exactly this name, or Google skips every row." },
      ]
    : [];

  return (
    <DsPage className="max-w-3xl">
      <div className="flex items-end gap-3">
        <BackLink href="/app/insights/lead-sources" className="mb-1.5" />
        <PageHeader
          className="min-w-0 flex-1"
          eyebrow={eyebrow}
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
        <section className="ds-rise">
          <SectionTitle info="Payments from the last 90 days by leads who reached your website through a Google ad. Google only accepts a payment within 90 days of the ad click. A deposit and the balance are reported as two payments.">
            {status.enabled ? "What Google is being told" : "What Google would be told"}
          </SectionTitle>
          <Card className="grid grid-cols-3 divide-x divide-[color:var(--ds-line)]" data-testid="ads-feed-numbers">
            <div className="px-4 py-3.5 lg:px-5 lg:py-4">
              <p className="ds-num text-xl font-semibold lg:text-2xl text-[color:var(--ds-ink)]">{status.adLeads}</p>
              <p className="ds-small mt-0.5 flex items-center gap-1">
                Ad leads
                <InfoTip>Leads from the last 90 days who arrived on a Google ad click.</InfoTip>
              </p>
            </div>
            <div className="px-4 py-3.5 lg:px-5 lg:py-4">
              <p className="ds-num text-xl font-semibold lg:text-2xl text-[color:var(--ds-ink)]">{status.payments}</p>
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
              <p className="ds-num text-xl font-semibold lg:text-2xl text-[color:var(--ds-ink)]">{money(status.value)}</p>
              <p className="ds-small mt-0.5">Collected</p>
            </div>
          </Card>
        </section>

        {!status.enabled ? (
          <section className="ds-rise" style={{ ["--ds-i" as string]: 1 }}>
            <Card className="flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center">
              <p className="min-w-0 flex-1 text-[14.5px] text-[color:var(--ds-ink)]">Turn it on to get the file address for Google Ads.</p>
              <Button loading={busy} onClick={() => void call("POST")} data-testid="ads-feed-on">
                Turn on
              </Button>
            </Card>
          </section>
        ) : (
          <>
            <section className="ds-rise" style={{ ["--ds-i" as string]: 1 }}>
              <SectionTitle info="You do this once, in your Google Ads account. After that Google fetches the file by itself.">Set it up in Google Ads</SectionTitle>
              <Card className="p-5">
                <ol className="list-decimal space-y-2.5 pl-5 text-[14.5px] text-[color:var(--ds-ink)]">
                  <li>
                    In Google Ads, open <strong>Goals</strong>, then <strong>Summary</strong>, and create a conversion action. Choose <strong>Conversions offline</strong>.
                  </li>
                  <li>
                    Add a data source and choose <strong>HTTPS</strong>. Paste the file address, user name and password from below.
                  </li>
                  <li>
                    Name the conversion action exactly as shown below, and have it use the value from the file.
                  </li>
                  <li>
                    Match the columns (they carry Google&apos;s own names) and set it to run every day.
                  </li>
                </ol>
              </Card>
              <Card className="mt-4 overflow-hidden">
                <ul className="ds-divide">
                  {values.map((v) => (
                    <li key={v.key} className="flex items-center gap-3 px-5 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="ds-label flex items-center gap-1">
                          {v.label}
                          {v.info && <InfoTip>{v.info}</InfoTip>}
                        </span>
                        <code className="mt-1 block truncate rounded-[10px] bg-[color:var(--ds-surface-2)] px-3 py-2 text-[13px] text-[color:var(--ds-ink)]" title={v.value} data-testid={`ads-feed-${v.key}`}>
                          {v.value}
                        </code>
                      </span>
                      <Button variant="outline" size="sm" icon={copied === v.key ? Check : Copy} onClick={() => void copy(v.key, v.value)} aria-label={`Copy ${v.label.toLowerCase()}`}>
                        {copied === v.key ? "Copied" : "Copy"}
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>

            <section className="ds-rise flex flex-wrap items-center gap-2" style={{ ["--ds-i" as string]: 2 }}>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void newAddress()}>
                Make a new address
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void turnOff()} data-testid="ads-feed-off">
                Turn off
              </Button>
            </section>
          </>
        )}
      </div>
    </DsPage>
  );
}
