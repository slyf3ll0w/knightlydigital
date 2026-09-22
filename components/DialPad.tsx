"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Delete, Loader2, Phone } from "lucide-react";
import { getSoftphoneState, softphone, softphoneIdle, useSoftphone } from "@/lib/softphone-client";

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

/** "469" → "469-833" → "(469) 833-5853" as the digits arrive; +1 and anything odd shown as typed. */
export function fmtDialing(value: string): string {
  if (!value) return "";
  if (value.startsWith("+") && !value.startsWith("+1")) return value;
  if (/[*#]/.test(value)) return value;
  let d = value.replace(/\D/g, "");
  let prefix = "";
  if (value.startsWith("+1") || (d.length === 11 && d.startsWith("1"))) {
    d = d.replace(/^1/, "");
    prefix = "+1 ";
  }
  if (d.length > 10) return value;
  if (d.length <= 3) return prefix + d;
  if (d.length <= 7) return `${prefix}${d.slice(0, 3)}-${d.slice(3)}`;
  return `${prefix}(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

type Lookup = { id: string; name: string; status: "LEAD" | "ACTIVE" | "ARCHIVED" } | null;

export default function DialPad({
  mode = "dial",
  className = "",
}: {
  mode?: "dial" | "tones";
  className?: string;
}) {
  const router = useRouter();
  const sp = useSoftphone();
  const [value, setValue] = useState("");
  const [lookup, setLookup] = useState<Lookup>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
    if (tones) {
      softphone.sendDigits(k);
      setValue((v) => (v + k).slice(-24));
      return;
    }
    // No focus() here: on a phone that would raise the keyboard over the keypad.
    setValue((v) => (v + k).slice(0, 20));
  };

  // Hold 0 → "+"
  const onKeyDown = (k: string) => {
    held.current = false;
    if (k !== "0" || tones) return;
    holdTimer.current = setTimeout(() => {
      held.current = true;
      setValue((v) => (v.endsWith("0") ? `${v.slice(0, -1)}+` : `${v}+`).slice(0, 20));
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

  async function call() {
    if (!canDial) return;
    setBusy(true);
    setError("");
    const to = value.trim();
    const target = lookup ? { contactId: lookup.id, label: lookup.name } : { to };
    try {
      let callId: string | null = null;
      if (softphoneIdle(sp)) {
        await softphone.placeCall({ ...target, to });
        callId = getSoftphoneState().call?.callId ?? null;
      } else {
        // No browser softphone here (phone, other tab, switched off): ring the cell first, then the customer.
        const res = await fetch("/api/app/line/call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(lookup ? { contactId: lookup.id } : { to }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string; callId?: string };
        if (!res.ok) throw new Error(data.error || "Couldn't place the call.");
        callId = data.callId ?? null;
      }
      setValue("");
      setLookup(null);
      if (callId) router.push(`/app/calls/${callId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't place the call.");
    } finally {
      setBusy(false);
    }
  }

  const standing = lookup ? (lookup.status === "LEAD" ? "lead" : lookup.status === "ACTIVE" ? "client" : "") : "";

  return (
    <div className={`select-none ${className}`}>
      <div className="relative">
        <input
          ref={input}
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={fmtDialing(value)}
          onChange={(e) => {
            // The display is formatted; keep only what a phone accepts.
            const raw = e.target.value.replace(/[^0-9*#+]/g, "");
            setError("");
            if (tones) {
              const added = raw.replace(/\D/g, "").slice(value.replace(/\D/g, "").length);
              if (added) softphone.sendDigits(added);
            }
            setValue(raw.slice(0, tones ? 24 : 20));
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
          className="numeral-ledger w-full bg-transparent px-8 py-1 text-center text-[26px] font-semibold tracking-wide text-gray-900 placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-gray-400 focus:outline-none"
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
        ) : digits.length >= 10 && !tones ? (
          <span className="text-gray-400">Not in your list yet</span>
        ) : null}
      </p>

      <div className="mx-auto mt-3 grid w-fit grid-cols-3 gap-x-5 gap-y-2.5">
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
            className="flex h-[54px] w-[54px] flex-col items-center justify-center rounded-full bg-gray-100 text-gray-900 transition-[transform,background-color] duration-100 hover:bg-gray-200 active:scale-95 active:bg-gray-300"
          >
            <span className={`numeral-ledger leading-none ${k === "*" ? "mt-2 text-[30px]" : "text-[22px]"} font-semibold`}>{k}</span>
            {letters && <span className={`mt-0.5 text-[9px] leading-none tracking-[0.18em] ${k === "0" ? "text-sm tracking-normal" : ""} text-gray-500`}>{letters}</span>}
          </button>
        ))}
      </div>

      {!tones && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => void call()}
            disabled={!canDial}
            aria-label={onCall ? "Already on a call" : "Call"}
            title={onCall ? "Already on a call" : softphoneIdle(sp) ? "Call from this browser" : "Ring your cell first, then connect them"}
            className="flex h-[54px] w-[54px] items-center justify-center rounded-full bg-green-500 text-white shadow-md transition-[transform,background-color] duration-100 hover:bg-green-600 active:scale-95 disabled:opacity-40 disabled:shadow-none"
          >
            {busy ? <Loader2 size={22} className="animate-spin" /> : <Phone size={22} />}
          </button>
        </div>
      )}
    </div>
  );
}
