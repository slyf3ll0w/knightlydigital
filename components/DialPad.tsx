"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Delete, Loader2, Phone } from "lucide-react";
import {
  getSoftphoneState,
  softphone,
  softphoneElsewhere,
  softphoneFallbackNote,
  softphoneIdle,
  softphoneRecoverable,
  useSoftphone,
  waitForSoftphone,
} from "@/lib/softphone-client";
import { DIAL_MAX, dialDisplaySize, fmtDialing, normalizeDialed } from "@/lib/dial-format";
import { hapticImpact } from "@/lib/haptics";

/**
 * A phone keypad. Two jobs:
 *
 *   dial   (the Calls page) — type or tap a number, see who it belongs to as
 *          the digits land (GET /api/app/contacts/lookup), press the green
 *          button. In the browser the softphone places the call; otherwise
 *          the tier-1 flow rings the cell first. Either way the call screen
 *          opens for that call.
 *   tones  (the call screen, mid-call) — every key is a touch-tone on the
 *          live call, for "press 1 for…" menus and gate codes.
 *
 * Keys play the real DTMF pair (Web Audio, quiet, 70 ms) so it feels like a
 * phone; holding 0 gives "+" for international numbers. The display is a
 * real input, so the keyboard and paste work too.
 */

const KEYS: Array<[string, string]> = [
  ["1", ""],
  ["2", "ABC"],
  ["3", "DEF"],
  ["4", "GHI"],
  ["5", "JKL"],
  ["6", "MNO"],
  ["7", "PQRS"],
  ["8", "TUV"],
  ["9", "WXYZ"],
  ["*", ""],
  ["0", "+"],
  ["#", ""],
];

const DTMF: Record<string, [number, number]> = {
  "1": [697, 1209], "2": [697, 1336], "3": [697, 1477],
  "4": [770, 1209], "5": [770, 1336], "6": [770, 1477],
  "7": [852, 1209], "8": [852, 1336], "9": [852, 1477],
  "*": [941, 1209], "0": [941, 1336], "#": [941, 1477],
};

let audioCtx: AudioContext | null = null;
function beep(key: string) {
  const pair = DTMF[key];
  if (!pair) return;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx ?? new Ctx();
    const ctx = audioCtx;
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    const gain = ctx.createGain();
    gain.gain.value = 0.04;
    gain.connect(ctx.destination);
    for (const f of pair) {
      const osc = ctx.createOscillator();
      osc.frequency.value = f;
      osc.connect(gain);
      osc.start();
      osc.stop(ctx.currentTime + 0.07);
    }
    setTimeout(() => gain.disconnect(), 120);
  } catch {
    /* no audio — fine */
  }
}

export { fmtDialing };

type Lookup = { id: string; name: string; status: "LEAD" | "ACTIVE" | "ARCHIVED" } | null;

export default function DialPad({
  mode = "dial",
  size = "md",
  className = "",
}: {
  mode?: "dial" | "tones";
  /** "lg" = the phone-sized keys (72px, the iOS keypad) for the bottom sheet; "md" = the desktop panel and the call screen's tones. */
  size?: "md" | "lg";
  className?: string;
}) {
  const router = useRouter();
  const sp = useSoftphone();
  const [value, setValue] = useState("");
  const [lookup, setLookup] = useState<Lookup>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** A quiet word after a call went out another way than expected ("rang your cell first"). */
  const [note, setNote] = useState("");
  /** The browser softphone was down when Call was pressed: reconnecting before the call goes out. */
  const [reconnecting, setReconnecting] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);

  const tones = mode === "tones";
  const digits = value.replace(/\D/g, "");

  // Who is this? Asked once the number is long enough to be someone's.
  useEffect(() => {
    if (tones) return;
    if (digits.length < 10) {
      setLookup(null);
      return;
    }
    let stale = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/app/contacts/lookup?phone=${encodeURIComponent(value)}`, { cache: "no-store" });
        const j = (await res.json()) as { contact?: Lookup };
        if (!stale) setLookup(j.contact ?? null);
      } catch {
        if (!stale) setLookup(null);
      }
    }, 250);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [value, digits.length, tones]);

  const press = (k: string) => {
    beep(k);
    setError("");
    setNote("");
    if (tones) {
      softphone.sendDigits(k);
      setValue((v) => (v + k).slice(-24));
      return;
    }
    // No focus() here: on a phone that would raise the keyboard over the keypad.
    setValue((v) => (v + k).slice(0, DIAL_MAX));
  };

  // Hold 0 → "+"
  const onKeyDown = (k: string) => {
    held.current = false;
    if (k !== "0" || tones) return;
    holdTimer.current = setTimeout(() => {
      held.current = true;
      setValue((v) => (v.endsWith("0") ? `${v.slice(0, -1)}+` : `${v}+`).slice(0, DIAL_MAX));
    }, 450);
  };
  const onKeyUp = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  const backspace = () => {
    setError("");
    setValue((v) => v.slice(0, -1));
    input.current?.focus({ preventScroll: true });
  };

  const onCall = sp.status === "ready" && !!sp.call;
  const canDial = !tones && value.trim().length >= 3 && !busy && !onCall;
  /** Registration is down for a reason a reconnect can fix — the dialer says so instead of quietly ringing the cell. */
  const down = !tones && softphoneRecoverable(sp);
  /** Another tab of this browser holds the line: "Ring here instead" brings it over; never the cell. */
  const elsewhere = !tones && softphoneElsewhere(sp);
  const fallbackNote = tones ? null : softphoneFallbackNote(sp);

  async function call() {
    if (!canDial) return;
    setBusy(true);
    setError("");
    setNote("");
    const to = value.trim();
    const target = lookup ? { contactId: lookup.id, label: lookup.name } : { to };
    try {
      let callId: string | null = null;
      let inApp = softphoneIdle(sp);
      if (!inApp && (softphoneRecoverable(sp) || softphoneElsewhere(sp))) {
        // The browser was registered a moment ago and lost it (a socket
        // drop, an expired grant), or another tab of this browser holds the
        // line: get it here before the call goes out, rather than surprising
        // the caller with their cell ringing. Eight seconds is plenty for a
        // fresh token + registration; past that the cell flow takes over
        // (reconnect) — or, for another tab, nothing does: that tab is on a
        // call, and the line under the number says so.
        setReconnecting(true);
        if (softphoneElsewhere(sp)) softphone.takeOver();
        else softphone.reconnect();
        inApp = (await waitForSoftphone(8_000)) && softphoneIdle(getSoftphoneState());
        setReconnecting(false);
        if (!inApp && softphoneElsewhere(getSoftphoneState())) {
          throw new Error("Your other WorkBench tab kept the line — it may be on a call. Dial from that tab, or close it and try again.");
        }
      }
      if (inApp) {
        await softphone.placeCall({ ...target, to });
        callId = getSoftphoneState().call?.callId ?? null;
      } else {
        // No browser softphone here (phone, switched off, or still down): ring the cell first, then the customer.
        const st = getSoftphoneState();
        console.info(`[softphone] keypad: placing the call via the cell (softphone ${st.status}${st.reason ? ` ${st.reason}` : ""})`);
        const res = await fetch("/api/app/line/call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(lookup ? { contactId: lookup.id } : { to }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string; callId?: string };
        if (!res.ok) throw new Error(data.error || "Couldn't place the call.");
        callId = data.callId ?? null;
        if (softphoneRecoverable(getSoftphoneState())) setNote("The browser wasn't connected, so this one rings your cell first.");
      }
      setValue("");
      setLookup(null);
      if (callId) router.push(`/app/calls/${callId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't place the call.");
    } finally {
      setReconnecting(false);
      setBusy(false);
    }
  }

  const shown = fmtDialing(value);
  const big = size === "lg";
  const sizeCls = (big ? { lg: "text-[34px]", md: "text-[28px]", sm: "text-[22px]" } : { lg: "text-[26px]", md: "text-[22px]", sm: "text-[18px]" })[dialDisplaySize(shown)];
  // Key hardware: WorkBench tool tiles (white, hairline, soft depth — the
  // btn-tool-line surface every secondary control uses) with Oxanium digits.
  // 60×52 in the desktop panel, 88×64 continuous-corner tiles on a phone sheet.
  const gridCls = big ? "mx-auto mt-4 grid w-fit grid-cols-3 gap-3" : "mx-auto mt-3 grid w-fit grid-cols-3 gap-2";
  const keyCls = big ? "h-[64px] w-[88px] rounded-[18px]" : "h-[52px] w-[60px] rounded-[12px]";
  const digitCls = big ? "text-[28px]" : "text-[22px]";
  const starCls = big ? "mt-2.5 text-[36px]" : "mt-2 text-[30px]";
  const lettersCls = big ? "text-[10px]" : "text-[9px]";
  // The Call button is console ink (the solid navy of the Create tiles and
  // the Atlas mark), not the green CTA — David wanted no green on the pad.
  const callCls = big ? "mt-4 h-[52px] gap-2 text-base" : "mt-3 h-11 gap-1.5 text-sm";

  const standing = lookup ? (lookup.status === "LEAD" ? "lead" : lookup.status === "ACTIVE" ? "client" : "") : "";

  return (
    <div className={`select-none ${className}`}>
      {/* The number sits on a ledger rule, like a figure on a statement. */}
      <div className="relative border-b border-gray-200 pb-1">
        <input
          ref={input}
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={shown}
          onChange={(e) => {
            // The display is formatted; keep only what a phone accepts. A
            // pasted "+1 (469) …" becomes the ten digits (lib/dial-format.ts).
            setError("");
            setNote("");
            if (tones) {
              const raw = e.target.value.replace(/[^0-9*#+]/g, "");
              const added = raw.replace(/\D/g, "").slice(value.replace(/\D/g, "").length);
              if (added) softphone.sendDigits(added);
              setValue(raw.slice(0, 24));
              return;
            }
            setValue(normalizeDialed(e.target.value));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void call();
            }
          }}
          placeholder={tones ? "Touch-tones" : "Enter a number"}
          aria-label={tones ? "Touch-tones sent on this call" : "Number to call"}
          readOnly={tones}
          className={`numeral-ledger w-full bg-transparent px-8 py-1 text-center ${sizeCls} font-semibold tracking-wide text-gray-900 placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-gray-400 focus:outline-none`}
        />
        {value && (
          <button
            type="button"
            onClick={backspace}
            aria-label="Delete the last digit"
            className="absolute right-0 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <Delete size={18} />
          </button>
        )}
      </div>
      <p className="min-h-[18px] text-center text-[13px] leading-[18px]">
        {lookup ? (
          <>
            <span className="font-medium text-gray-800">{lookup.name}</span>
            {standing && <span className="text-gray-400"> · {standing}</span>}
          </>
        ) : error ? (
          <span className="text-red-600" role="alert">
            {error}
          </span>
        ) : note ? (
          <span className="text-gray-500">{note}</span>
        ) : reconnecting ? (
          <span className="text-gray-500">{elsewhere ? "Bringing the line to this tab…" : "Reconnecting the browser…"}</span>
        ) : digits.length >= 10 && !tones ? (
          <span className="text-gray-400">Not in your list yet</span>
        ) : null}
      </p>
      {fallbackNote && !reconnecting && (
        <p className={`mt-0.5 text-center text-[12px] leading-[16px] ${down || elsewhere ? "text-amber-700" : "text-gray-400"}`}>
          {fallbackNote}
          {down && (
            <>
              {" "}
              <button type="button" onClick={() => softphone.reconnect()} className="font-medium underline hover:text-amber-900">
                Retry
              </button>
            </>
          )}
          {elsewhere && (
            <>
              {" "}
              <button type="button" onClick={() => softphone.takeOver()} className="font-medium underline hover:text-amber-900">
                Ring here instead
              </button>
            </>
          )}
        </p>
      )}

      <div className={gridCls}>
        {KEYS.map(([k, letters]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              if (held.current) {
                held.current = false;
                return;
              }
              press(k);
            }}
            onPointerDown={() => onKeyDown(k)}
            onPointerUp={onKeyUp}
            onPointerLeave={onKeyUp}
            aria-label={k === "0" ? "0 (hold for +)" : k}
            className={`btn-tool-line flex ${keyCls} flex-col items-center justify-center bg-white text-gray-900 hover:bg-gray-50 active:bg-gray-100`}
          >
            <span className={`numeral-ledger leading-none ${k === "*" ? starCls : digitCls} font-semibold`}>{k}</span>
            {letters && <span className={`mt-0.5 ${lettersCls} leading-none tracking-[0.18em] ${k === "0" ? "text-sm tracking-normal" : ""} text-gray-500`}>{letters}</span>}
          </button>
        ))}
      </div>

      {!tones && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => {
              hapticImpact("LIGHT");
              void call();
            }}
            disabled={!canDial}
            aria-label={onCall ? "Already on a call" : reconnecting ? "Reconnecting the browser" : "Call"}
            title={
              onCall
                ? "Already on a call"
                : softphoneIdle(sp)
                  ? "Call from this browser"
                  : down
                    ? "Reconnects the browser first; rings your cell if it can't"
                    : elsewhere
                      ? "Brings the line to this tab, then calls from here"
                      : "Ring your cell first, then connect them"
            }
            style={{ backgroundColor: "var(--wb-primary, #0A1428)" }}
            className={`btn-tool chamfer flex w-full items-center justify-center rounded-[10px] font-semibold text-white disabled:opacity-40 ${callCls}`}
          >
            {busy ? <Loader2 size={big ? 20 : 16} className="animate-spin" /> : <Phone size={big ? 20 : 16} />}
            Call
          </button>
        </div>
      )}
    </div>
  );
}
