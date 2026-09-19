"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Phone, RefreshCw } from "lucide-react";
import {
  CALLER_ID_MAX,
  TOLL_FREE_USE_CASES,
  TOLL_FREE_VOLUMES,
  VERTICALS,
  type LineSummary,
  type LineType,
  type RegistrationForm,
} from "@/lib/business-line-shared";

/**
 * Settings → Features: the company's business line (lib/business-line.ts).
 *
 * Three moments, top to bottom:
 *   1. No number yet → pick an area code, get one. Calls forward right away.
 *   2. Number, no texting registration → the carrier registration form.
 *   3. Registration filed → a status chip that moves on its own (hourly
 *      sweep + Telnyx webhook), a Refresh button for the impatient, and the
 *      rejection reason verbatim with an "Edit and resubmit" path.
 *
 * Every write goes through /api/app/line/* and comes back with the fresh
 * LineSummary, which replaces local state wholesale — no client-side guessing
 * about what Telnyx did.
 */

const fmtPhone = (e164: string | null) => {
  if (!e164) return "";
  const d = e164.replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}` : e164;
};
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";

const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10";
const primaryBtn =
  "inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50";
const ghostBtn = "inline-flex items-center gap-1.5 text-sm text-gray-500 underline hover:text-gray-700 disabled:opacity-50";

async function post<T>(url: string, body?: unknown, method = "POST"): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

export default function BusinessLineCard({ initial }: { initial: LineSummary }) {
  const [line, setLine] = useState<LineSummary>(initial);
  const [error, setError] = useState("");

  return (
    <div className="card-ledger p-5 space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Phone size={15} className="text-gray-400" />
          Business Line
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          A phone number that&apos;s yours: calls to it ring your cell and announce who&apos;s calling,
          unanswered calls go to voicemail, you can call clients from it, and once the carriers
          approve your business, reminders and quote and invoice links text from it too.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}

      {!line.number ? (
        <GetNumber line={line} onDone={setLine} onError={setError} />
      ) : (
        <>
          {line.releaseAt && <ReleaseNotice line={line} />}
          <NumberRow line={line} onDone={setLine} onError={setError} />
          <CallerIdName line={line} onDone={setLine} onError={setError} />
          {line.voice.routed && <VoicemailGreeting line={line} onDone={setLine} onError={setError} />}
          <Texting line={line} onDone={setLine} onError={setError} />
        </>
      )}
    </div>
  );
}

/* ───────────────────────── 1. Get a number ───────────────────────── */

function GetNumber({
  line,
  onDone,
  onError,
}: {
  line: LineSummary;
  onDone: (l: LineSummary) => void;
  onError: (e: string) => void;
}) {
  const [type, setType] = useState<LineType>("local");
  const [areaCode, setAreaCode] = useState(line.defaults.areaCode);
  const [forwardTo, setForwardTo] = useState(line.defaults.forwardTo);
  const [busy, setBusy] = useState(false);

  if (!line.entitled) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-600">
        A business line is part of{" "}
        <Link href="/app/settings/addon" className="font-medium text-gray-900 underline">
          Workbench Plus
        </Link>
        . Until then, the free Call and Text buttons keep working from your own phone.
      </div>
    );
  }

  async function provision() {
    setBusy(true);
    onError("");
    try {
      await post("/api/app/line/provision", { type, areaCode, forwardTo });
      onDone(await post<LineSummary>("/api/app/line", undefined, "GET"));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn't get a number.");
    }
    setBusy(false);
  }

  const tollFree = type === "toll_free";
  return (
    <div className="space-y-3">
      <fieldset className="grid gap-2 sm:grid-cols-2">
        {(
          [
            ["local", "Local number", "Your area code. What most service businesses want — customers answer a local call."],
            ["toll_free", "Toll-free (8xx) number", "National presence, free for callers. You pay per inbound minute."],
          ] as const
        ).map(([value, label, hint]) => (
          <label
            key={value}
            className={`cursor-pointer rounded-lg border px-3 py-2 ${type === value ? "border-gray-900 bg-gray-50" : "border-gray-200"}`}
          >
            <input type="radio" name="lineType" value={value} checked={type === value} onChange={() => setType(value)} className="mr-2" />
            <span className="text-sm font-medium text-gray-800">{label}</span>
            <span className="block pl-5 text-xs text-gray-500">{hint}</span>
          </label>
        ))}
      </fieldset>
      <div className={`grid gap-3 ${tollFree ? "" : "sm:grid-cols-[8rem_1fr]"}`}>
        {!tollFree && (
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Area code</span>
            <input
              value={areaCode}
              onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))}
              inputMode="numeric"
              placeholder="214"
              className={`${inputCls} mt-1`}
            />
          </label>
        )}
        <label className="block">
          <span className="text-xs font-medium text-gray-600">Ring calls through to</span>
          <input
            value={forwardTo}
            onChange={(e) => setForwardTo(e.target.value)}
            inputMode="tel"
            placeholder="Your cell number"
            className={`${inputCls} mt-1`}
          />
        </label>
      </div>
      <p className="text-xs text-gray-500">
        {tollFree
          ? "You'll get a toll-free number. Calls forward the moment it's live; the caller sees your business number. Texting needs a one-time carrier verification (next step) that usually takes one to two weeks."
          : "You'll get a local number in that area code. Calls forward the moment it's live; the caller sees your business number. Texting needs a one-time carrier registration (next step) and takes a few business days to clear."}
      </p>
      <button type="button" onClick={provision} disabled={busy || (!tollFree && areaCode.length !== 3)} className={primaryBtn}>
        {busy && <Loader2 size={14} className="animate-spin" />}
        {busy ? "Getting your number…" : tollFree ? "Get a toll-free number" : "Get a number"}
      </button>
    </div>
  );
}

/* ───────────────────────── The number is theirs: post-cancellation notice ───────────────────────── */

function ReleaseNotice({ line }: { line: LineSummary }) {
  const when = new Date(line.releaseAt!).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const subject = encodeURIComponent(`Keep my number ${line.number}`);
  const body = encodeURIComponent(
    `Hi — my Workbench Plus plan ended and I'd like to keep ${line.number}. Please tell me how to port it to my new carrier.`
  );
  return (
    <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm">
      <p className="flex items-center gap-2 font-medium text-red-800">
        <AlertTriangle size={16} />
        Your plan ended — this number is released on {when}
      </p>
      <p className="text-xs text-red-700">
        Calls keep forwarding until then. The number is yours to keep: {" "}
        <Link href="/app/settings/addon" className="font-medium underline">
          resubscribe
        </Link>{" "}
        and it stays here, or{" "}
        <a href={`mailto:contact@workbenchfsm.com?subject=${subject}&body=${body}`} className="font-medium underline">
          ask us to port it
        </a>{" "}
        to another carrier before that date. After it, the number is gone for good.
      </p>
    </div>
  );
}

/* ───────────────────────── 2. The number + forwarding ───────────────────────── */

function NumberRow({
  line,
  onDone,
  onError,
}: {
  line: LineSummary;
  onDone: (l: LineSummary) => void;
  onError: (e: string) => void;
}) {
  const [editing, setEditing] = useState(!line.forwardTo);
  const [forwardTo, setForwardTo] = useState(line.forwardTo ?? line.defaults.forwardTo);
  const [busy, setBusy] = useState(false);

  async function save(next: string | null) {
    setBusy(true);
    onError("");
    try {
      await post("/api/app/line", { forwardTo: next }, "PATCH");
      onDone(await post<LineSummary>("/api/app/line", undefined, "GET"));
      setEditing(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn't update forwarding.");
    }
    setBusy(false);
  }

  return (
    <div className="rounded-lg border border-gray-200 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-lg font-semibold tabular-nums text-gray-900">{fmtPhone(line.number)}</p>
        <p className="text-xs text-gray-500">
          Your {line.type === "toll_free" ? "toll-free " : ""}business line
          {line.provisionedAt ? ` · since ${fmtDate(line.provisionedAt)}` : ""}
        </p>
      </div>
      {editing ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block flex-1 min-w-[12rem]">
            <span className="text-xs font-medium text-gray-600">Ring calls through to</span>
            <input
              value={forwardTo}
              onChange={(e) => setForwardTo(e.target.value)}
              inputMode="tel"
              placeholder="Your cell number"
              className={`${inputCls} mt-1`}
            />
          </label>
          <button type="button" onClick={() => save(forwardTo)} disabled={busy || !forwardTo.trim()} className={primaryBtn}>
            {busy && <Loader2 size={14} className="animate-spin" />}
            Save
          </button>
          {line.forwardTo && (
            <button type="button" onClick={() => setEditing(false)} disabled={busy} className={ghostBtn}>
              Cancel
            </button>
          )}
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="text-gray-700">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500 mr-2 align-middle" />
            Calls ring through to {fmtPhone(line.forwardTo)}
            {line.voice.routed && <span className="text-gray-500"> · shows as {fmtPhone(line.number)}, press 1 to accept</span>}
          </p>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setEditing(true)} className={ghostBtn}>
              Change
            </button>
            <button type="button" onClick={() => save(null)} disabled={busy} className={ghostBtn}>
              Stop forwarding
            </button>
          </div>
        </div>
      )}
      {!line.forwardTo && !editing && (
        <p className="mt-2 text-xs text-amber-700">
          {line.voice.routed
            ? "Calls go straight to voicemail until you add a number to ring."
            : "Calls aren’t forwarded anywhere yet — add a number above."}
        </p>
      )}
      {line.voice.routed ? (
        <p className="mt-2 text-xs text-gray-500">
          Your cell rings from the business number and hears who&apos;s calling first, so the cell&apos;s own
          voicemail can never grab a customer. Missed calls and voicemails land in{" "}
          <Link href="/app/calls" className="underline">
            Calls
          </Link>
          . To call a client from this number, use <em>Call from line</em> on their page
          {line.voice.canCall ? "" : " after adding your cell under My Profile"}.
        </p>
      ) : line.voice.available && line.forwardTo ? (
        <p className="mt-2 text-xs text-amber-700">
          Save your ring-through number again to turn on call announcements, voicemail and calling from the app.
        </p>
      ) : null}
    </div>
  );
}

/* ───────────────────────── 2a. Caller ID name ───────────────────────── */

function CallerIdName({
  line,
  onDone,
  onError,
}: {
  line: LineSummary;
  onDone: (l: LineSummary) => void;
  onError: (e: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(line.voice.callerIdName ?? line.voice.defaultCallerIdName);
  const [busy, setBusy] = useState(false);

  async function save(next: string) {
    setBusy(true);
    onError("");
    try {
      await post("/api/app/line", { callerIdName: next }, "PATCH");
      const fresh = await post<LineSummary>("/api/app/line", undefined, "GET");
      onDone(fresh);
      setName(fresh.voice.callerIdName ?? fresh.voice.defaultCallerIdName);
      setEditing(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn’t save the caller ID name.");
    }
    setBusy(false);
  }

  return (
    <div className="rounded-lg border border-gray-200 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-gray-800">Caller ID name</p>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className={ghostBtn}>
            {line.voice.callerIdName ? "Change" : "Set it"}
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase().slice(0, CALLER_ID_MAX))}
              maxLength={CALLER_ID_MAX}
              className={`${inputCls} max-w-xs font-mono uppercase`}
              placeholder={line.voice.defaultCallerIdName}
            />
            <button type="button" onClick={() => save(name)} disabled={busy || !name.trim()} className={primaryBtn}>
              {busy && <Loader2 size={14} className="animate-spin" />}
              Save
            </button>
            {line.voice.callerIdName && (
              <button type="button" onClick={() => save("")} disabled={busy} className={ghostBtn}>
                Turn off
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setName(line.voice.callerIdName ?? line.voice.defaultCallerIdName);
              }}
              disabled={busy}
              className={ghostBtn}
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Up to {CALLER_ID_MAX} letters, numbers and spaces. Carriers take a few days to pick it up, and some mobile
            carriers only show it to people using a caller ID app.
          </p>
        </div>
      ) : (
        <p className="mt-1 text-sm text-gray-600">
          {line.voice.callerIdName ? (
            <>
              Customers you call see <span className="font-mono">{line.voice.callerIdName}</span> next to your number, where their carrier shows names.
            </>
          ) : (
            "Not set — customers you call see the number only."
          )}
        </p>
      )}
    </div>
  );
}

/* ───────────────────────── 2b. Voicemail greeting ───────────────────────── */

function VoicemailGreeting({
  line,
  onDone,
  onError,
}: {
  line: LineSummary;
  onDone: (l: LineSummary) => void;
  onError: (e: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(line.voice.greeting ?? line.voice.defaultGreeting);
  const [busy, setBusy] = useState(false);

  async function save(next: string | null) {
    setBusy(true);
    onError("");
    try {
      await post("/api/app/line", { greeting: next }, "PATCH");
      const fresh = await post<LineSummary>("/api/app/line", undefined, "GET");
      onDone(fresh);
      setText(fresh.voice.greeting ?? fresh.voice.defaultGreeting);
      setEditing(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn’t save the greeting.");
    }
    setBusy(false);
  }

  return (
    <div className="rounded-lg border border-gray-200 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-gray-800">Voicemail greeting</p>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className={ghostBtn}>
            {line.voice.greeting ? "Change" : "Write your own"}
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={600} className={inputCls} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => save(text)} disabled={busy || !text.trim()} className={primaryBtn}>
              {busy && <Loader2 size={14} className="animate-spin" />}
              Save
            </button>
            {line.voice.greeting && (
              <button type="button" onClick={() => save(null)} disabled={busy} className={ghostBtn}>
                Back to the default
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setText(line.voice.greeting ?? line.voice.defaultGreeting);
              }}
              disabled={busy}
              className={ghostBtn}
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-gray-500">Read aloud by a synthetic voice, then a beep. Callers get up to three minutes.</p>
        </div>
      ) : (
        <p className="mt-1 text-sm text-gray-600">&ldquo;{line.voice.greeting ?? line.voice.defaultGreeting}&rdquo;</p>
      )}
    </div>
  );
}

/* ───────────────────────── 3. Texting registration ───────────────────────── */

function Texting({
  line,
  onDone,
  onError,
}: {
  line: LineSummary;
  onDone: (l: LineSummary) => void;
  onError: (e: string) => void;
}) {
  const reg = line.registration;
  const [resubmitting, setResubmitting] = useState(false);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    onError("");
    try {
      onDone(await post<LineSummary>("/api/app/line/refresh"));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn't check right now.");
    }
    setBusy(false);
  }

  if (!reg || (reg.status === "REJECTED" && resubmitting)) {
    return (
      <RegistrationForm
        line={line}
        initial={reg?.form ?? null}
        onDone={(l) => {
          setResubmitting(false);
          onDone(l);
        }}
        onError={onError}
        onCancel={reg ? () => setResubmitting(false) : undefined}
      />
    );
  }

  const checked = reg.lastCheckedAt ? `Checked ${new Date(reg.lastCheckedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "";

  const tollFree = reg.kind === "TOLL_FREE";

  if (reg.status === "ACTIVE") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm">
        <p className="flex items-center gap-2 text-green-800">
          <CheckCircle2 size={16} />
          Texting is on{reg.approvedAt ? ` · ${tollFree ? "verified" : "approved"} ${fmtDate(reg.approvedAt)}` : ""}
        </p>
        <p className="text-xs text-green-700">{tollFree ? "Verified" : "Registered"} to {reg.form.legalName}</p>
      </div>
    );
  }

  if (reg.status === "REJECTED") {
    return (
      <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm">
        <p className="flex items-center gap-2 font-medium text-red-800">
          <AlertTriangle size={16} />
          {tollFree && reg.rejectionReason?.toLowerCase().includes("more information")
            ? "The reviewer needs more from you"
            : "The carriers didn't approve texting"}
        </p>
        <p className="text-red-700">{reg.rejectionReason}</p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setResubmitting(true)} className={primaryBtn}>
            Edit and resubmit
          </button>
          <span className="text-xs text-red-600">Calls keep forwarding either way.</span>
        </div>
      </div>
    );
  }

  const awaitingPin = reg.status === "BRAND_PENDING" && reg.entityType === "SOLE_PROPRIETOR";
  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium text-amber-800">
          <Loader2 size={16} className="animate-spin" />
          {awaitingPin
            ? "Waiting on your verification PIN"
            : tollFree
              ? "Toll-free verification is under review"
              : reg.status === "BRAND_PENDING"
                ? "Verifying your business with the carrier registry"
                : "Carriers are reviewing your texting registration"}
        </p>
        <button type="button" onClick={refresh} disabled={busy} className={ghostBtn}>
          <RefreshCw size={13} className={busy ? "animate-spin" : ""} />
          Check now
        </button>
      </div>
      <p className="text-xs text-amber-700">
        {awaitingPin
          ? `We texted a PIN to ${fmtPhone(reg.form.contactPhone)}. Enter it below within 24 hours.`
          : tollFree
            ? "Usually one to two weeks. Reminders and links go by email until this clears, and the free Text button on jobs keeps working from your phone."
            : "Usually 3–7 business days. Reminders and links go by email until this clears, and the free Text button on jobs keeps working from your phone."}
        {reg.verificationStatus ? ` Telnyx status: ${reg.verificationStatus}.` : ""}
        {checked ? ` ${checked}.` : ""}
      </p>
      {awaitingPin && <OtpEntry onDone={onDone} onError={onError} />}
    </div>
  );
}

function OtpEntry({ onDone, onError }: { onDone: (l: LineSummary) => void; onError: (e: string) => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState<"verify" | "resend" | null>(null);

  async function send(body: { pin: string } | { resend: true }) {
    setBusy("pin" in body ? "verify" : "resend");
    onError("");
    try {
      onDone(await post<LineSummary>("/api/app/line/otp", body));
    } catch (err) {
      onError(err instanceof Error ? err.message : "That didn't work.");
    }
    setBusy(null);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
        inputMode="numeric"
        placeholder="PIN"
        className={`${inputCls} w-28`}
      />
      <button type="button" onClick={() => send({ pin })} disabled={busy !== null || pin.length < 4} className={primaryBtn}>
        {busy === "verify" && <Loader2 size={14} className="animate-spin" />}
        Verify
      </button>
      <button type="button" onClick={() => send({ resend: true })} disabled={busy !== null} className={ghostBtn}>
        Resend PIN
      </button>
    </div>
  );
}

/* ───────────────────────── The registration form ───────────────────────── */

function RegistrationForm({
  line,
  initial,
  onDone,
  onError,
  onCancel,
}: {
  line: LineSummary;
  initial: RegistrationForm | null;
  onDone: (l: LineSummary) => void;
  onError: (e: string) => void;
  onCancel?: () => void;
}) {
  const d = line.defaults;
  const tollFree = line.type === "toll_free";
  const [f, setF] = useState<RegistrationForm>(
    initial ?? {
      messageVolume: "1,000",
      useCase: "Appointments",
      entityType: "PRIVATE_PROFIT",
      legalName: d.legalName,
      displayName: d.displayName,
      ein: "",
      street: d.street,
      city: d.city,
      state: d.state,
      postalCode: d.postalCode,
      website: d.website,
      vertical: "CONSTRUCTION",
      contactFirstName: d.contactFirstName,
      contactLastName: d.contactLastName,
      contactEmail: d.contactEmail,
      contactPhone: d.contactPhone,
    }
  );
  const [busy, setBusy] = useState(false);
  const set = (k: keyof RegistrationForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));
  const sole = !tollFree && f.entityType === "SOLE_PROPRIETOR";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError("");
    try {
      onDone(await post<LineSummary>("/api/app/line/register", f));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn't submit.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-700">{tollFree ? "Verify for texting" : "Register for texting"}</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          {tollFree
            ? "Toll-free numbers are verified by the carriers before they can text. This is filed once, in your business's name, and usually takes one to two weeks."
            : "US carriers require every business that texts to be registered, under its own legal name. This is filed once, in your business's name, and takes 3–7 business days to clear."}
          {!line.entitled && " Part of Workbench Plus."}
        </p>
      </div>

      {tollFree && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Texts you expect to send" hint="Reminders, links and replies — most shops are well under 1,000">
            <select value={f.messageVolume ?? "1,000"} onChange={set("messageVolume")} className={inputCls}>
              {TOLL_FREE_VOLUMES.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="What the texts are for">
            <select value={f.useCase ?? "Appointments"} onChange={set("useCase")} className={inputCls}>
              {TOLL_FREE_USE_CASES.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}

      <fieldset className={`grid gap-2 sm:grid-cols-2 ${tollFree ? "hidden" : ""}`}>
        {(
          [
            ["PRIVATE_PROFIT", "Registered business (has an EIN)", "LLC, corporation, or partnership"],
            ["SOLE_PROPRIETOR", "Sole proprietor (no EIN)", "You'll verify by a PIN texted to your mobile"],
          ] as const
        ).map(([value, label, hint]) => (
          <label
            key={value}
            className={`cursor-pointer rounded-lg border px-3 py-2 ${f.entityType === value ? "border-gray-900 bg-gray-50" : "border-gray-200"}`}
          >
            <input
              type="radio"
              name="entityType"
              value={value}
              checked={f.entityType === value}
              onChange={() => setF((p) => ({ ...p, entityType: value }))}
              className="mr-2"
            />
            <span className="text-sm font-medium text-gray-800">{label}</span>
            <span className="block pl-5 text-xs text-gray-500">{hint}</span>
          </label>
        ))}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Legal business name" hint={sole ? "Your full legal name" : "Exactly as on your IRS letter"}>
          <input value={f.legalName} onChange={set("legalName")} className={inputCls} required />
        </Field>
        <Field label="Name clients know you by" hint="What appears in the registration as your brand">
          <input value={f.displayName ?? ""} onChange={set("displayName")} className={inputCls} />
        </Field>
        {!sole && (
          <Field label="EIN" hint="9 digits, from your CP575 or 147C letter">
            <input value={f.ein ?? ""} onChange={set("ein")} inputMode="numeric" placeholder="12-3456789" className={inputCls} required />
          </Field>
        )}
        <Field label="Industry">
          <select value={f.vertical} onChange={set("vertical")} className={inputCls}>
            {VERTICALS.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Street address" hint="No PO boxes" className="sm:col-span-2">
          <input value={f.street} onChange={set("street")} className={inputCls} required />
        </Field>
        <Field label="City">
          <input value={f.city} onChange={set("city")} className={inputCls} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="State">
            <input value={f.state} onChange={set("state")} maxLength={2} placeholder="TX" className={inputCls} required />
          </Field>
          <Field label="ZIP">
            <input value={f.postalCode} onChange={set("postalCode")} inputMode="numeric" className={inputCls} required />
          </Field>
        </div>
        <Field
          label="Website"
          hint={tollFree ? "Required — the reviewer checks it against the business name" : "Or a social page — optional but helps approval"}
          className="sm:col-span-2"
        >
          <input value={f.website ?? ""} onChange={set("website")} placeholder="https://" className={inputCls} required={tollFree} />
        </Field>
        <Field label="Contact first name">
          <input value={f.contactFirstName} onChange={set("contactFirstName")} className={inputCls} required />
        </Field>
        <Field label="Contact last name">
          <input value={f.contactLastName} onChange={set("contactLastName")} className={inputCls} required />
        </Field>
        <Field label="Contact email">
          <input type="email" value={f.contactEmail} onChange={set("contactEmail")} className={inputCls} required />
        </Field>
        <Field label={sole ? "Your mobile (gets the PIN)" : "Contact phone"}>
          <input value={f.contactPhone} onChange={set("contactPhone")} inputMode="tel" className={inputCls} required />
        </Field>
      </div>

      <p className="text-xs text-gray-500">
        {tollFree
          ? "Verification is free. The reviewer compares the business name, website and address, so keep them consistent. If they need anything else you'll see exactly what here and can fix and resubmit."
          : "Registry fees are covered by your plan. If the registry can't match these details you'll see exactly why here and can fix and resubmit."}
        {sole && " The PIN expires 24 hours after we send it."}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy || !line.entitled} className={primaryBtn}>
          {busy && <Loader2 size={14} className="animate-spin" />}
          {busy ? "Submitting…" : initial ? "Resubmit" : tollFree ? "Verify for texting" : "Register for texting"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={busy} className={ghostBtn}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-0.5 block text-[11px] text-gray-400">{hint}</span>}
    </label>
  );
}
