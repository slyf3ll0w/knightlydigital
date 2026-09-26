"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarCheck, Check, Copy, Link2, Loader2, RefreshCw } from "lucide-react";
import SectionHeader from "@/components/SectionHeader";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { confirmSheet } from "@/components/ConfirmSheet";
import { getCapacitor } from "@/components/NativeShell";

/**
 * My Profile → "Calendar sync" (docs/plans/google-calendar-sync-2026-09-11.md).
 * Two independent halves: the private .ics subscribe link (always available)
 * and the Google Calendar push (hidden until the server has Google keys).
 */

type FeedState = { url: string | null; webcalUrl: string | null; lastFetchedAt: string | null };
type GoogleState =
  | { configured: false; connected: false }
  | { configured: true; connected: false }
  | {
      configured: true;
      connected: true;
      googleEmail: string;
      syncEnabled: boolean;
      lastSyncAt: string | null;
      lastSyncError: string | null;
      eventCount: number;
      pullEnabled: boolean;
      shareTitles: boolean;
      lastPullAt: string | null;
      lastPullError: string | null;
      busyCount: number;
    };

const btnPrimary =
  "flex items-center gap-1.5 px-4 py-2 bg-[color:var(--ds-primary)] hover:bg-[color:var(--ds-primary-strong)] active:bg-[color:var(--ds-primary-strong)] text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors disabled:opacity-50 shrink-0";
const btnLine =
  "flex items-center gap-1.5 rounded-[10px] btn-tool-line bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 shrink-0";
const btnQuiet =
  "flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-sm font-medium text-[color:var(--ds-bad)] transition-colors hover:bg-[color:var(--ds-bad-soft)] disabled:opacity-50 shrink-0";

function ago(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

const CALLBACK_MESSAGES: Record<string, { tone: "ok" | "err"; text: string }> = {
  connected: { tone: "ok", text: "Google Calendar connected. Your schedule is being added now." },
  denied: { tone: "err", text: "Google connection cancelled — nothing was changed." },
  bad_state: { tone: "err", text: "That connection link expired. Try connecting again." },
  exchange_failed: { tone: "err", text: "Google didn't complete the connection. Try again in a moment." },
  unauthorized: { tone: "err", text: "Sign in, then connect Google Calendar again." },
  missing_params: { tone: "err", text: "Google sent us back without a code. Try again." },
};

/**
 * Google's consent screen can't load in the native webview — accounts.google.com
 * is outside capacitor.config.ts's allowNavigation, and outside iOS app-bound
 * domains. So in the shell we ask the server for the consent URL and hand it to
 * Capacitor's Browser plugin (already bundled) instead of following a redirect
 * the webview would refuse. The callback finishes in that browser without the
 * app session, which is why it authenticates off the signed state.
 */
async function startGoogleConnect(): Promise<string | null> {
  const browser = getCapacitor()?.Plugins?.Browser;
  if (!browser?.open) {
    // Web: an ordinary redirect is all this ever needed.
    window.location.assign("/api/app/integrations/google-calendar/connect");
    return null;
  }
  try {
    const res = await fetch("/api/app/integrations/google-calendar/connect?mode=url");
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.url) return data?.error ?? GENERIC_ERROR;
    await browser.open({ url: data.url });
    return null;
  } catch {
    return "Couldn't reach Google. Check your connection and try again.";
  }
}

export default function CalendarSyncCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [feed, setFeed] = useState<FeedState | null>(null);
  const [google, setGoogle] = useState<GoogleState | null>(null);
  const [busy, setBusy] = useState<"" | "feed" | "google">("");
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const loadFeed = useCallback(async () => {
    try {
      const res = await fetch("/api/app/profile/calendar-feed");
      if (res.ok) setFeed(await res.json());
    } catch {
      // leave the card in its loading state; a retry happens on next action
    }
  }, []);
  const loadGoogle = useCallback(async () => {
    try {
      const res = await fetch("/api/app/integrations/google-calendar/status");
      if (res.ok) setGoogle(await res.json());
    } catch {
      // same
    }
  }, []);

  useEffect(() => {
    loadFeed();
    loadGoogle();
  }, [loadFeed, loadGoogle]);

  // Back from Google's consent screen: say what happened, then clean the URL
  useEffect(() => {
    const flag = searchParams.get("gcal");
    if (!flag) return;
    const msg = CALLBACK_MESSAGES[flag];
    if (msg) setNotice(msg);
    router.replace("/app/settings/profile#calendar-sync", { scroll: false });
  }, [searchParams, router]);

  const connectGoogle = useCallback(async () => {
    setBusy("google");
    setNotice(null);
    const err = await startGoogleConnect();
    setBusy("");
    if (err) setNotice({ tone: "err", text: err });
  }, []);

  // In the shell, consent happens in a browser sheet over the app — the
  // callback never reloads this page, so pick the connection up on the way back.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") loadGoogle();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [loadGoogle]);

  // The first push after connecting runs in the background — poll until it lands
  useEffect(() => {
    if (!google || !google.connected || google.lastSyncAt || google.lastSyncError) return;
    const t = setInterval(loadGoogle, 3000);
    return () => clearInterval(t);
  }, [google, loadGoogle]);

  async function createOrRotate(rotate: boolean) {
    if (
      rotate &&
      !(await confirmSheet({
        title: "Make a new link?",
        message: "The old link stops working right away. Any calendar app using it will need the new one.",
        confirmLabel: "New link",
      }))
    )
      return;
    setBusy("feed");
    setNotice(null);
    const r = await postJson<FeedState>("/api/app/profile/calendar-feed");
    setBusy("");
    if (!r.ok || !r.data) return setNotice({ tone: "err", text: r.data?.error ?? GENERIC_ERROR });
    setFeed(r.data);
  }

  async function turnOffFeed() {
    if (
      !(await confirmSheet({
        title: "Turn off the subscribe link?",
        message: "Calendar apps using it will stop updating. You can make a new link any time.",
        confirmLabel: "Turn off",
        destructive: true,
      }))
    )
      return;
    setBusy("feed");
    const r = await postJson("/api/app/profile/calendar-feed", undefined, "DELETE");
    setBusy("");
    if (!r.ok) return setNotice({ tone: "err", text: GENERIC_ERROR });
    setFeed({ url: null, webcalUrl: null, lastFetchedAt: null });
  }

  async function copyLink() {
    if (!feed?.url) return;
    try {
      await navigator.clipboard.writeText(feed.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setNotice({ tone: "err", text: "Couldn't copy — select the link and copy it by hand." });
    }
  }

  async function syncNow() {
    setBusy("google");
    setNotice(null);
    const r = await postJson<{ created: number; updated: number; deleted: number; errors: number }>(
      "/api/app/integrations/google-calendar/sync"
    );
    setBusy("");
    if (!r.ok || !r.data) return setNotice({ tone: "err", text: r.data?.error ?? GENERIC_ERROR });
    const { created, updated, deleted, errors } = r.data;
    setNotice(
      errors > 0
        ? { tone: "err", text: `Synced with ${errors} problem${errors === 1 ? "" : "s"} — see below.` }
        : {
            tone: "ok",
            text:
              created + updated + deleted === 0
                ? "Google Calendar is up to date."
                : `Google Calendar updated: ${created} added, ${updated} changed, ${deleted} removed.`,
          }
    );
    loadGoogle();
  }

  async function setPullSetting(patch: { pullEnabled?: boolean; shareTitles?: boolean }) {
    if (!google?.connected) return;
    setBusy("google");
    setNotice(null);
    const r = await postJson("/api/app/integrations/google-calendar/settings", patch, "PATCH");
    setBusy("");
    if (!r.ok) return setNotice({ tone: "err", text: r.data?.error ?? GENERIC_ERROR });
    loadGoogle();
  }

  async function disconnect() {
    if (
      !(await confirmSheet({
        title: "Disconnect Google Calendar?",
        message: "The events Workbench added to your Google Calendar are removed. Your Workbench schedule isn't touched.",
        confirmLabel: "Disconnect",
        destructive: true,
      }))
    )
      return;
    setBusy("google");
    setNotice(null);
    const r = await postJson("/api/app/integrations/google-calendar/disconnect");
    setBusy("");
    if (!r.ok) return setNotice({ tone: "err", text: GENERIC_ERROR });
    setGoogle({ configured: true, connected: false });
  }

  return (
    <div id="calendar-sync" className="ds-card p-5 mt-5 scroll-mt-24">
      <div className="flex items-start gap-3 mb-4">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-gray-100 text-gray-600">
          <CalendarCheck size={16} />
        </div>
        <div className="min-w-0">
          <SectionHeader
            title="Calendar sync"
            hint="See your Workbench schedule — the jobs you're on, your appointments, and blocked time — in the calendar app you already use."
          />
        </div>
      </div>

      {notice && (
        <div
          className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
            notice.tone === "ok"
              ? "border-transparent bg-[color:var(--ds-good-soft)] text-[color:var(--ds-good)]"
              : "border-transparent bg-[color:var(--ds-bad-soft)] text-[color:var(--ds-bad)]"
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* Subscribe link */}
      <div className="rounded-[12px] border border-gray-200 p-4 mb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">Subscribe link</h3>
            <p className="text-xs text-gray-500 mt-0.5 max-w-md">
              Works with Google Calendar, Apple Calendar, and Outlook. Read-only; your calendar app refreshes it on
              its own schedule (Google every several hours, Apple hourly).
            </p>
          </div>
          {feed && !feed.url && (
            <button type="button" onClick={() => createOrRotate(false)} disabled={busy === "feed"} className={btnPrimary}>
              {busy === "feed" ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
              Create link
            </button>
          )}
        </div>
        {feed?.url && (
          <div className="mt-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                readOnly
                value={feed.url}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono text-gray-700 bg-gray-50"
              />
              <button type="button" onClick={copyLink} className={btnLine}>
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <ul className="mt-3 text-xs text-gray-500 space-y-1">
              <li>
                <span className="font-medium text-gray-700">Google Calendar:</span> Other calendars → + → From URL →
                paste the link.
              </li>
              <li>
                <span className="font-medium text-gray-700">Apple Calendar / Outlook:</span>{" "}
                <a href={feed.webcalUrl ?? "#"} className="text-[color:var(--ds-primary)] underline underline-offset-2">
                  open as a subscription
                </a>{" "}
                or use File → New Calendar Subscription with the link.
              </li>
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => createOrRotate(true)} disabled={busy === "feed"} className={btnLine}>
                {busy === "feed" ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                New link
              </button>
              <button type="button" onClick={turnOffFeed} disabled={busy === "feed"} className={btnQuiet}>
                Turn off
              </button>
              <span className="text-xs text-gray-500 ml-auto">
                Last opened by a calendar app: {ago(feed.lastFetchedAt)}
              </span>
            </div>
          </div>
        )}
        {!feed && (
          <p className="mt-3 text-xs text-gray-500 flex items-center gap-1.5">
            <Loader2 size={12} className="animate-spin" /> Loading…
          </p>
        )}
      </div>

      {/* Google push — only once the server has Google keys */}
      {google?.configured && (
        <div className="rounded-[12px] border border-gray-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-900">Google Calendar</h3>
              {google.connected ? (
                <p className="text-xs text-gray-500 mt-0.5 max-w-md">
                  Connected as <span className="font-medium text-gray-700">{google.googleEmail}</span>. Schedule
                  changes reach Google within seconds; busy time in Google shows up here as blocked time.
                </p>
              ) : (
                <p className="text-xs text-gray-500 mt-0.5 max-w-md">
                  Puts your schedule into your Google account&apos;s calendar and keeps it updated as things
                  move, and brings your Google busy time in here so nobody books over it.
                </p>
              )}
            </div>
            {!google.connected && (
              <button type="button" onClick={connectGoogle} disabled={busy === "google"} className={btnPrimary}>
                {busy === "google" ? <Loader2 size={13} className="animate-spin" /> : <CalendarCheck size={13} />}
                Connect Google Calendar
              </button>
            )}
          </div>

          {google.connected && (
            <div className="mt-3">
              {google.lastSyncError ? (
                <div className="mb-3 rounded-lg bg-[color:var(--ds-warn-soft)] px-3 py-2 text-xs text-[color:var(--ds-warn)]">
                  {google.lastSyncError}
                  {!google.syncEnabled && (
                    <>
                      {" "}
                      <button
                        type="button"
                        onClick={connectGoogle}
                        disabled={busy === "google"}
                        className="font-semibold underline underline-offset-2 disabled:opacity-50"
                      >
                        Reconnect
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <p className="mb-3 text-xs text-gray-500">
                  {google.lastSyncAt
                    ? `${google.eventCount} event${google.eventCount === 1 ? "" : "s"} in Google · last synced ${ago(google.lastSyncAt)}`
                    : "Adding your schedule to Google now…"}
                </p>
              )}
              {google.lastPullError && (
                <div className="mb-3 rounded-lg bg-[color:var(--ds-warn-soft)] px-3 py-2 text-xs text-[color:var(--ds-warn)]">
                  Reading Google: {google.lastPullError}
                </div>
              )}
              <div className="mb-3 space-y-2">
                <label className="flex items-start gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[color:var(--ds-primary)] focus:ring-[color:var(--ds-primary)]"
                    checked={google.pullEnabled}
                    disabled={busy === "google"}
                    onChange={(e) => setPullSetting({ pullEnabled: e.target.checked })}
                  />
                  <span>
                    Show my Google events here as busy time
                    <span className="block text-xs text-gray-500">
                      {google.pullEnabled
                        ? `${google.busyCount} busy block${google.busyCount === 1 ? "" : "s"} on your schedule · checked ${ago(google.lastPullAt)}. Events marked Free in Google are skipped.`
                        : "Your Google events stay in Google only."}
                    </span>
                  </span>
                </label>
                {google.pullEnabled && (
                  <label className="flex items-start gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[color:var(--ds-primary)] focus:ring-[color:var(--ds-primary)]"
                      checked={google.shareTitles}
                      disabled={busy === "google"}
                      onChange={(e) => setPullSetting({ shareTitles: e.target.checked })}
                    />
                    <span>
                      Show the event names to my team
                      <span className="block text-xs text-gray-500">
                        Off = teammates just see &ldquo;Busy&rdquo; on the company calendar.
                      </span>
                    </span>
                  </label>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={syncNow} disabled={busy === "google"} className={btnLine}>
                  {busy === "google" ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  Sync now
                </button>
                <button type="button" onClick={disconnect} disabled={busy === "google"} className={btnQuiet}>
                  Disconnect
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
