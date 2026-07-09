"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  Bug,
  Check,
  Loader2,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  Sparkle,
  Trash2,
  Wrench,
} from "lucide-react";
import { postJson } from "@/lib/safe-fetch";

const OXANIUM = { fontFamily: "Oxanium, system-ui, sans-serif" } as const;

type Category = "FEATURE" | "BUG" | "QOL";
const ORDER: Category[] = ["FEATURE", "BUG", "QOL"];

interface Item {
  id: string;
  category: Category;
  title: string;
  details: string | null; // public note
  privateNotes?: string | null; // editors only — server strips it for everyone else
  shippedAt: string | null;
  createdAt: string;
}

const SECTIONS: Record<Category, { label: string; blurb: string; icon: React.ReactNode }> = {
  FEATURE: {
    label: "Features",
    blurb: "New capabilities coming to the Hub.",
    icon: <Sparkle size={16} />,
  },
  BUG: {
    label: "Bugs",
    blurb: "Known issues and what we've squashed.",
    icon: <Bug size={16} />,
  },
  QOL: {
    label: "Quality of Life",
    blurb: "Small touches that make everyday work smoother.",
    icon: <Wrench size={16} />,
  },
};

// Tab-switch animation timing (ms) — out first, then the new section in
const OUT_MS = 190;
const IN_MS = 260;

function shipDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function RoadmapClient({
  initialItems,
  canEdit,
  app = false,
}: {
  initialItems: Item[];
  canEdit: boolean;
  /** In-app (/app/roadmap): AppShell provides the chrome. Public (/roadmap): a slim top bar renders instead. */
  app?: boolean;
}) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Tabbed sections with a slide transition. `shown` is what's on screen;
  // `anim` drives the out/in keyframes; the ref blocks double-clicks mid-flight.
  const [shown, setShown] = useState<Category>("FEATURE");
  const [anim, setAnim] = useState("");
  const switching = useRef(false);

  function selectTab(next: Category) {
    if (next === shown || switching.current) return;
    const dir = ORDER.indexOf(next) > ORDER.indexOf(shown) ? 1 : -1;
    switching.current = true;
    setAnim(dir === 1 ? "rm-out-left" : "rm-out-right");
    setTimeout(() => {
      setShown(next);
      setAnim(dir === 1 ? "rm-in-right" : "rm-in-left");
      setTimeout(() => {
        switching.current = false;
        setAnim("");
      }, IN_MS);
    }, OUT_MS);
  }

  async function toggleShipped(item: Item) {
    setBusyId(item.id);
    const { ok, data } = await postJson<Item>(
      `/api/roadmap/${item.id}`,
      { shipped: !item.shippedAt },
      "PATCH"
    );
    setBusyId(null);
    if (ok && data) setItems((all) => all.map((i) => (i.id === item.id ? { ...i, ...data } : i)));
  }

  async function removeItem(item: Item) {
    if (!confirm(`Delete "${item.title}" from the board?`)) return;
    setBusyId(item.id);
    const { ok } = await postJson(`/api/roadmap/${item.id}`, undefined, "DELETE");
    setBusyId(null);
    if (ok) setItems((all) => all.filter((i) => i.id !== item.id));
  }

  async function savePrivateNotes(item: Item, text: string) {
    setBusyId(item.id);
    const { ok, data } = await postJson<Item>(
      `/api/roadmap/${item.id}`,
      { privateNotes: text },
      "PATCH"
    );
    setBusyId(null);
    if (ok && data) setItems((all) => all.map((i) => (i.id === item.id ? { ...i, ...data } : i)));
    return ok;
  }

  const section = SECTIONS[shown];
  const inSection = items.filter((i) => i.category === shown);
  const upcoming = inSection.filter((i) => !i.shippedAt);
  const shipped = inSection
    .filter((i) => i.shippedAt)
    .sort((a, b) => (b.shippedAt! < a.shippedAt! ? -1 : 1));

  return (
    <div className={app ? "" : "min-h-screen bg-gray-50"}>
      <style>{`
        @keyframes rm-out-left  { to   { opacity: 0; transform: translateX(-56px); } }
        @keyframes rm-out-right { to   { opacity: 0; transform: translateX(56px); } }
        @keyframes rm-in-right  { from { opacity: 0; transform: translateX(56px); } to { opacity: 1; transform: none; } }
        @keyframes rm-in-left   { from { opacity: 0; transform: translateX(-56px); } to { opacity: 1; transform: none; } }
        .rm-out-left  { animation: rm-out-left ${OUT_MS}ms ease-in forwards; }
        .rm-out-right { animation: rm-out-right ${OUT_MS}ms ease-in forwards; }
        .rm-in-right  { animation: rm-in-right ${IN_MS}ms cubic-bezier(0.16, 1, 0.3, 1) both; }
        .rm-in-left   { animation: rm-in-left ${IN_MS}ms cubic-bezier(0.16, 1, 0.3, 1) both; }
      `}</style>

      {/* Slim app-style top bar for the public page (in-app, AppShell handles chrome) */}
      {!app && (
        <div className="bg-rail">
          <div className="max-w-5xl mx-auto px-4 lg:px-8 h-14 flex items-center justify-between">
            <Link href="/" className="text-white font-semibold text-sm tracking-wide" style={OXANIUM}>
              Streamflaire <span className="text-green-500">Hub</span>
            </Link>
            <Link
              href="/app/dashboard"
              className="text-xs font-semibold text-white/70 hover:text-white transition-colors"
            >
              Open the app →
            </Link>
          </div>
        </div>
      )}

      <div className={`max-w-5xl mx-auto px-4 lg:px-8 ${app ? "pt-4 lg:pt-8" : "pt-8"} pb-12`}>
        <h1 className="numeral-ledger text-2xl font-semibold text-gray-900 mb-1">
          Upcoming Features
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          What we&apos;re building next for the Hub — and everything that&apos;s already shipped.
        </p>

        {/* ── Tabs ── */}
        <div className="flex gap-2 mb-6 flex-wrap" role="tablist">
          {ORDER.map((cat) => {
            const active = cat === shown;
            const count = items.filter((i) => i.category === cat && !i.shippedAt).length;
            return (
              <button
                key={cat}
                role="tab"
                aria-selected={active}
                onClick={() => selectTab(cat)}
                className={`chamfer flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-[#0C0F0C] text-white"
                    : "bg-white border border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-900"
                }`}
                style={OXANIUM}
              >
                <span className={active ? "text-green-500" : "text-gray-400"}>
                  {SECTIONS[cat].icon}
                </span>
                {SECTIONS[cat].label}
                {count > 0 && (
                  <span
                    className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                      active ? "bg-green-500 text-white" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Active section (slides out/in on tab change) ── */}
        <div key={shown} className={anim}>
          <div className="flex items-center gap-2 mb-1 text-gray-900">
            <span className="text-green-600">{section.icon}</span>
            <h2 className="text-lg font-semibold" style={OXANIUM}>
              {section.label}
            </h2>
          </div>
          <p className="text-sm text-gray-500 mb-4">{section.blurb}</p>

          <div className="grid md:grid-cols-2 gap-5 items-start">
            {/* Upcoming */}
            <div className="card-ledger">
              <div
                className="px-4 py-2.5 text-xs font-bold uppercase tracking-widest border-b border-gray-200 text-gray-500"
                style={OXANIUM}
              >
                Upcoming
              </div>
              <ul className="divide-y divide-gray-100">
                {upcoming.length === 0 && (
                  <li className="px-4 py-4 text-sm text-gray-400 italic">
                    Nothing queued here right now.
                  </li>
                )}
                {upcoming.map((item) => (
                  <li key={item.id} className="px-4 py-3 flex items-start gap-3">
                    {canEdit && (
                      <button
                        onClick={() => toggleShipped(item)}
                        disabled={busyId === item.id}
                        title="Mark shipped"
                        className="mt-0.5 shrink-0 border-2 border-gray-300 hover:border-green-500 transition-colors flex items-center justify-center"
                        style={{ width: 18, height: 18 }}
                      >
                        {busyId === item.id && (
                          <Loader2 size={11} className="animate-spin text-gray-400" />
                        )}
                      </button>
                    )}
                    <ItemBody
                      item={item}
                      canEdit={canEdit}
                      busy={busyId === item.id}
                      onSavePrivate={(t) => savePrivateNotes(item, t)}
                    />
                    {canEdit && (
                      <button
                        onClick={() => removeItem(item)}
                        disabled={busyId === item.id}
                        title="Delete"
                        className="text-gray-300 hover:text-red-500 transition-colors shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {canEdit && (
                <AddForm category={shown} onAdded={(i) => setItems((all) => [i, ...all])} />
              )}
            </div>

            {/* Shipped */}
            <div className="card-ledger">
              <div
                className="px-4 py-2.5 text-xs font-bold uppercase tracking-widest border-b border-gray-200 flex items-center gap-1.5 text-green-600"
                style={OXANIUM}
              >
                <Check size={13} strokeWidth={3} /> Shipped
              </div>
              <ul className="divide-y divide-gray-100">
                {shipped.length === 0 && (
                  <li className="px-4 py-4 text-sm text-gray-400 italic">
                    Shipped items will land here.
                  </li>
                )}
                {shipped.map((item) => (
                  <li key={item.id} className="px-4 py-3 flex items-start gap-3">
                    <span
                      className="mt-0.5 shrink-0 flex items-center justify-center bg-green-500 text-white"
                      style={{ width: 18, height: 18 }}
                    >
                      <Check size={12} strokeWidth={3.5} />
                    </span>
                    <ItemBody
                      item={item}
                      canEdit={canEdit}
                      busy={busyId === item.id}
                      onSavePrivate={(t) => savePrivateNotes(item, t)}
                      shippedLabel={`Shipped ${shipDate(item.shippedAt!)}`}
                    />
                    {canEdit && (
                      <span className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => toggleShipped(item)}
                          disabled={busyId === item.id}
                          title="Move back to Upcoming"
                          className="text-gray-300 hover:text-gray-600 transition-colors"
                        >
                          {busyId === item.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <RotateCcw size={14} />
                          )}
                        </button>
                        <button
                          onClick={() => removeItem(item)}
                          disabled={busyId === item.id}
                          title="Delete"
                          className="text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Title + public details for everyone; editors additionally get the amber
 * private-notes block with inline add/edit.
 */
function ItemBody({
  item,
  canEdit,
  busy,
  onSavePrivate,
  shippedLabel,
}: {
  item: Item;
  canEdit: boolean;
  busy: boolean;
  onSavePrivate: (text: string) => Promise<boolean>;
  shippedLabel?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.privateNotes ?? "");

  async function save() {
    if (await onSavePrivate(draft)) setEditing(false);
  }

  return (
    <div className="flex-1 min-w-0">
      <p className={`text-sm font-semibold ${shippedLabel ? "text-gray-700" : "text-gray-900"}`}>
        {item.title}
      </p>
      {item.details && (
        <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-line">{item.details}</p>
      )}
      {shippedLabel && (
        <p className="text-[11px] text-gray-400 mt-1" style={OXANIUM}>
          {shippedLabel}
        </p>
      )}

      {canEdit && !editing && item.privateNotes && (
        <div className="mt-2 px-2.5 py-2 bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-1.5">
          <Lock size={11} className="mt-0.5 shrink-0" />
          <span className="flex-1 whitespace-pre-line">{item.privateNotes}</span>
          <button
            onClick={() => {
              setDraft(item.privateNotes ?? "");
              setEditing(true);
            }}
            title="Edit private note"
            className="text-amber-400 hover:text-amber-700 transition-colors shrink-0"
          >
            <Pencil size={11} />
          </button>
        </div>
      )}
      {canEdit && !editing && !item.privateNotes && (
        <button
          onClick={() => {
            setDraft("");
            setEditing(true);
          }}
          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-gray-400 hover:text-amber-700 transition-colors"
        >
          <Lock size={10} /> Add private note
        </button>
      )}
      {canEdit && editing && (
        <div className="mt-2 flex flex-col gap-1.5">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Only editors see this…"
            rows={2}
            className="w-full px-2.5 py-1.5 border border-amber-300 bg-amber-50 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={busy}
              className="flex items-center gap-1 px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
              style={OXANIUM}
            >
              {busy && <Loader2 size={10} className="animate-spin" />} Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="px-2 py-1 text-[11px] font-semibold text-gray-500 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddForm({ category, onAdded }: { category: Category; onAdded: (item: Item) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [privateNotes, setPrivateNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!title.trim()) return;
    setBusy(true);
    const { ok, data } = await postJson<Item>("/api/roadmap", {
      category,
      title,
      details: details.trim() || undefined,
      privateNotes: privateNotes.trim() || undefined,
    });
    setBusy(false);
    if (ok && data) {
      onAdded(data);
      setTitle("");
      setDetails("");
      setPrivateNotes("");
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full px-4 py-2.5 border-t border-gray-200 text-xs font-semibold text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors flex items-center gap-1.5"
      >
        <Plus size={13} /> Add item
      </button>
    );
  }

  return (
    <div className="border-t border-gray-200 p-3 flex flex-col gap-2">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        placeholder="What's coming?"
        className="w-full px-2.5 py-1.5 border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
      />
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        placeholder="Public details — everyone sees this (optional)"
        rows={2}
        className="w-full px-2.5 py-1.5 border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
      />
      <textarea
        value={privateNotes}
        onChange={(e) => setPrivateNotes(e.target.value)}
        placeholder="Private note — only editors see this (optional)"
        rows={2}
        className="w-full px-2.5 py-1.5 border border-amber-300 bg-amber-50 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={add}
          disabled={busy || !title.trim()}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
          style={OXANIUM}
        >
          {busy && <Loader2 size={12} className="animate-spin" />} Add
        </button>
        <button
          onClick={() => setOpen(false)}
          className="px-3 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-800 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
