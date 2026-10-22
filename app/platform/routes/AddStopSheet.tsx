"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Coffee, Loader2, MapPin, ShoppingBag, SquareCheck, Warehouse, X } from "lucide-react";
import Modal from "@/components/Modal";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { InfoTip } from "@/components/ds";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import type { PlaceDTO } from "@/lib/places-shared";

type StopKindChoice = "errand" | "task" | "break";

export type AddStopJob = { id: string; title: string; contactName: string };

const LENGTHS = [15, 30, 45, 60, 90];

/**
 * "Add a stop" — the one sheet for a non-client stop on someone's day:
 * an errand (supply house, dump, parts drop-off), a task with a place, or
 * lunch. Places come first (two taps), then "somewhere else". By default
 * the optimizer places the stop; a window ("before 11") or a set time can
 * pin it, and an errand can be ordered before one of the day's jobs.
 * Posts to /api/app/route-plan/stops; the page refreshes on success.
 */
export default function AddStopSheet({
  open,
  onClose,
  date,
  dateLabel,
  userId,
  userName,
  jobs,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  dateLabel: string;
  userId: string;
  userName: string;
  /** The person's jobs that day, for "before this job". */
  jobs: AddStopJob[];
  onAdded: (message: string) => void;
}) {
  const [kind, setKind] = useState<StopKindChoice>("errand");
  const [places, setPlaces] = useState<PlaceDTO[] | null>(null);
  const [placeId, setPlaceId] = useState("");
  const [elsewhere, setElsewhere] = useState(false);
  const [address, setAddress] = useState("");
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [when, setWhen] = useState<"flex" | "window" | "at">("flex");
  const [after, setAfter] = useState("");
  const [before, setBefore] = useState("");
  const [at, setAt] = useState("");
  const [beforeJobId, setBeforeJobId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Reset per open; places load once per open (they rarely change)
  useEffect(() => {
    if (!open) return;
    setKind("errand");
    setPlaceId("");
    setElsewhere(false);
    setAddress("");
    setTitle("");
    setMinutes(30);
    setWhen("flex");
    setAfter("");
    setBefore("");
    setAt("");
    setBeforeJobId("");
    setError("");
    let cancelled = false;
    fetch("/api/app/places")
      .then((r) => (r.ok ? r.json() : { places: [] }))
      .then((d: { places?: PlaceDTO[] }) => {
        if (!cancelled) setPlaces(d.places ?? []);
      })
      .catch(() => {
        if (!cancelled) setPlaces([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const place = useMemo(() => places?.find((p) => p.id === placeId) ?? null, [places, placeId]);
  const whereOk = kind === "break" || Boolean(place) || (elsewhere && address.trim().length > 3);
  const titleOk = kind !== "task" || title.trim().length > 0;
  const canSave = whereOk && titleOk && !busy;

  const inputCls =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]";
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors ${
      active
        ? "border-[color:var(--ds-primary)] bg-[color:var(--ds-primary-soft)] text-[color:var(--ds-primary)]"
        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
    }`;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError("");
    const body: Record<string, unknown> = {
      date,
      userId,
      kind,
      title: title.trim() || undefined,
      durationMinutes: minutes,
      ...(kind !== "break" && place && !elsewhere ? { placeId: place.id } : {}),
      ...(kind !== "break" && elsewhere ? { address: address.trim() } : {}),
    };
    if (kind === "errand") {
      if (when === "at" && at) body.at = at;
      if (when === "window") {
        if (after) body.floatAfterMin = after;
        if (before) body.floatBeforeMin = before;
      }
      if (beforeJobId) body.beforeJobId = beforeJobId;
    }
    if (kind === "break" && when === "window") {
      if (after) body.floatAfterMin = after;
      if (before) body.floatBeforeMin = before;
    }
    const { ok, data } = await postJson<{ error?: string; kind?: string; pinned?: boolean }>("/api/app/route-plan/stops", body);
    setBusy(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    const what = kind === "break" ? "Lunch" : kind === "task" ? "Task" : title.trim() || place?.name || "Errand";
    onAdded(
      kind === "errand" && data?.pinned === false
        ? `${what} added to ${userName}'s ${dateLabel} — no map pin for that address yet, check it on the Places page.`
        : `${what} added to ${userName}'s ${dateLabel} — hit Optimize to slot it.`
    );
    onClose();
  }

  return (
    <Modal open={open} onClose={() => !busy && onClose()} size="md" dismissible={!busy} portal>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="flex items-center justify-between">
          <h3 className="ds-h2 flex items-center gap-1.5">
            Add a stop
            <InfoTip>
              A stop that isn&apos;t a client: a supply run, the dump, a task with a place, or lunch. Optimize fits it into the day — inside its
              window if it has one, and before the job it&apos;s for.
            </InfoTip>
          </h3>
          <button type="button" onClick={() => !busy && onClose()} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--ds-muted)] hover:bg-[color:var(--ds-surface-2)]">
            <X size={16} />
          </button>
        </div>
        <p className="-mt-2 text-xs text-gray-500">
          {userName} · {dateLabel}
        </p>
        {error && <div role="alert" className="form-error">{error}</div>}

        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              { key: "errand", label: "Errand", icon: ShoppingBag },
              { key: "task", label: "Task", icon: SquareCheck },
              { key: "break", label: "Lunch", icon: Coffee },
            ] as const
          ).map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => {
                setKind(k.key);
                if (k.key === "break") setMinutes(30);
              }}
              className={`flex items-center justify-center gap-1.5 rounded-[10px] border px-2 py-2 text-[13px] font-semibold transition-colors ${
                kind === k.key
                  ? "border-[color:var(--ds-primary)] bg-[color:var(--ds-primary-soft)] text-[color:var(--ds-primary)]"
                  : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              <k.icon size={15} />
              {k.label}
            </button>
          ))}
        </div>

        {kind !== "break" && (
          <div>
            <p className="mb-1 text-xs font-medium text-[color:var(--ds-ink-2)]">Where</p>
            {places === null ? (
              <p className="flex items-center gap-1.5 text-xs text-gray-400">
                <Loader2 size={12} className="animate-spin" /> Loading places…
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {places.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setPlaceId(p.id);
                      setElsewhere(false);
                      if (!title.trim() && kind === "errand") setTitle(p.name);
                    }}
                    className={`${chip(placeId === p.id && !elsewhere)} inline-flex items-center gap-1`}
                    title={p.address}
                  >
                    {p.kind === "SUPPLY" ? <Warehouse size={12} /> : <MapPin size={12} />}
                    {p.name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setElsewhere(true);
                    setPlaceId("");
                  }}
                  className={chip(elsewhere)}
                >
                  Somewhere else…
                </button>
              </div>
            )}
            {places !== null && places.length === 0 && !elsewhere && (
              <p className="mt-1.5 text-xs text-gray-500">
                No saved places yet.{" "}
                <Link href="/app/routes/places" className="font-medium text-[color:var(--ds-primary)] hover:underline">
                  Add your supply house
                </Link>{" "}
                once and it&apos;s one tap next time.
              </p>
            )}
            {elsewhere && (
              <div className="mt-2">
                <AddressAutocomplete
                  endpoint="/api/app/geocode/suggest"
                  value={address}
                  onChange={setAddress}
                  onPick={(a) => setAddress(a.label)}
                  placeholder="Street, city, state"
                  className={inputCls}
                  ariaLabel="Address"
                />
              </div>
            )}
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-[color:var(--ds-ink-2)]" htmlFor="stop-title">
            {kind === "task" ? "What needs doing" : "Name"}
          </label>
          <input
            id="stop-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder={kind === "break" ? "Lunch" : kind === "task" ? "Drop the permit at the city office" : place?.name || "Pick up the valve"}
            className={inputCls}
          />
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-[color:var(--ds-ink-2)]">How long</p>
          <div className="flex flex-wrap gap-1.5">
            {LENGTHS.map((m) => (
              <button key={m} type="button" onClick={() => setMinutes(m)} className={chip(minutes === m)}>
                {m < 60 ? `${m} min` : m === 60 ? "1 hr" : `${m / 60} hr`}
              </button>
            ))}
          </div>
        </div>

        {kind !== "task" && (
          <div>
            <p className="mb-1 text-xs font-medium text-[color:var(--ds-ink-2)]">When</p>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setWhen("flex")} className={chip(when === "flex")}>
                {kind === "break" ? "Company lunch window" : "Let Optimize place it"}
              </button>
              <button type="button" onClick={() => setWhen("window")} className={chip(when === "window")}>
                Between…
              </button>
              {kind === "errand" && (
                <button type="button" onClick={() => setWhen("at")} className={chip(when === "at")}>
                  At a set time
                </button>
              )}
            </div>
            {when === "window" && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input type="time" value={after} onChange={(e) => setAfter(e.target.value)} className={inputCls} aria-label="Not before" />
                <input type="time" value={before} onChange={(e) => setBefore(e.target.value)} className={inputCls} aria-label="Not after" />
              </div>
            )}
            {when === "at" && (
              <div className="mt-2">
                <input type="time" value={at} onChange={(e) => setAt(e.target.value)} className={inputCls} aria-label="At" />
              </div>
            )}
          </div>
        )}

        {kind === "errand" && jobs.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-medium text-[color:var(--ds-ink-2)]" htmlFor="stop-before">
              Before this job
            </label>
            <select id="stop-before" value={beforeJobId} onChange={(e) => setBeforeJobId(e.target.value)} className={inputCls}>
              <option value="">Doesn&apos;t matter</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                  {j.contactName ? ` — ${j.contactName}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={() => !busy && onClose()} className="rounded-[10px] px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button type="submit" disabled={!canSave} className="btn-primary">
            {busy && <Loader2 size={14} className="animate-spin" />}
            Add stop
          </button>
        </div>
      </form>
    </Modal>
  );
}
