"use client";

import { useState } from "react";
import { Bug, Check, Loader2, Plus, RotateCcw, Sparkle, Trash2, Wrench } from "lucide-react";
import { postJson } from "@/lib/safe-fetch";

const OXANIUM = { fontFamily: "Oxanium, system-ui, sans-serif" } as const;
const GREEN = "#22C55E";

type Category = "FEATURE" | "BUG" | "QOL";

interface Item {
  id: string;
  category: Category;
  title: string;
  details: string | null;
  shippedAt: string | null;
  createdAt: string;
}

const SECTIONS: { key: Category; label: string; blurb: string; icon: React.ReactNode }[] = [
  {
    key: "FEATURE",
    label: "Features",
    blurb: "New capabilities coming to the Hub.",
    icon: <Sparkle size={18} />,
  },
  {
    key: "BUG",
    label: "Bugs",
    blurb: "Known issues and what we've squashed.",
    icon: <Bug size={18} />,
  },
  {
    key: "QOL",
    label: "Quality of Life",
    blurb: "Small touches that make everyday work smoother.",
    icon: <Wrench size={18} />,
  },
];

function shipDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function RoadmapClient({
  initialItems,
  canEdit,
}: {
  initialItems: Item[];
  canEdit: boolean;
}) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  return (
    <div style={{ backgroundColor: "#F7F7F5", minHeight: "100vh" }}>
      {/* ── Hero ── */}
      <section
        className="relative"
        style={{ backgroundColor: "#0C0F0C", paddingTop: "148px", paddingBottom: "72px" }}
      >
        <div className="max-w-5xl mx-auto px-6 lg:px-8 text-center">
          <p
            className="text-xs font-bold uppercase tracking-widest mb-4"
            style={{ color: GREEN, ...OXANIUM }}
          >
            Streamflaire Hub
          </p>
          <h1
            className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-5"
            style={OXANIUM}
          >
            Upcoming <span style={{ color: GREEN }}>Features</span>
          </h1>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: "rgba(255,255,255,0.6)" }}>
            What we&apos;re building next — and everything that&apos;s already shipped. The Hub is
            free forever, and it gets better every week.
          </p>
        </div>
      </section>

      {/* ── Board ── */}
      <section className="max-w-5xl mx-auto px-6 lg:px-8 py-14 flex flex-col gap-12">
        {SECTIONS.map((section) => {
          const inSection = items.filter((i) => i.category === section.key);
          const upcoming = inSection.filter((i) => !i.shippedAt);
          const shipped = inSection
            .filter((i) => i.shippedAt)
            .sort((a, b) => (b.shippedAt! < a.shippedAt! ? -1 : 1));

          return (
            <div key={section.key}>
              <div className="flex items-center gap-2.5 mb-1" style={{ color: "#111827" }}>
                <span style={{ color: GREEN }}>{section.icon}</span>
                <h2 className="text-2xl font-bold" style={OXANIUM}>
                  {section.label}
                </h2>
              </div>
              <p className="text-sm text-gray-500 mb-5">{section.blurb}</p>

              <div className="grid md:grid-cols-2 gap-5 items-start">
                {/* Upcoming */}
                <div className="bg-white border border-gray-200">
                  <div
                    className="px-4 py-2.5 text-xs font-bold uppercase tracking-widest border-b border-gray-200"
                    style={{ color: "#6B7280", ...OXANIUM }}
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
                            className="mt-0.5 w-4.5 h-4.5 shrink-0 border-2 border-gray-300 hover:border-green-500 transition-colors flex items-center justify-center"
                            style={{ width: 18, height: 18 }}
                          >
                            {busyId === item.id && <Loader2 size={11} className="animate-spin text-gray-400" />}
                          </button>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                          {item.details && (
                            <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-line">{item.details}</p>
                          )}
                        </div>
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
                  {canEdit && <AddForm category={section.key} onAdded={(i) => setItems((all) => [i, ...all])} />}
                </div>

                {/* Shipped */}
                <div className="bg-white border border-gray-200">
                  <div
                    className="px-4 py-2.5 text-xs font-bold uppercase tracking-widest border-b border-gray-200 flex items-center gap-1.5"
                    style={{ color: GREEN, ...OXANIUM }}
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
                          className="mt-0.5 shrink-0 flex items-center justify-center text-white"
                          style={{ width: 18, height: 18, backgroundColor: GREEN }}
                        >
                          <Check size={12} strokeWidth={3.5} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-700">{item.title}</p>
                          {item.details && (
                            <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-line">{item.details}</p>
                          )}
                          <p className="text-[11px] text-gray-400 mt-1" style={OXANIUM}>
                            Shipped {shipDate(item.shippedAt!)}
                          </p>
                        </div>
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
          );
        })}
      </section>
    </div>
  );
}

function AddForm({ category, onAdded }: { category: Category; onAdded: (item: Item) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!title.trim()) return;
    setBusy(true);
    const { ok, data } = await postJson<Item>("/api/roadmap", {
      category,
      title,
      details: details.trim() || undefined,
    });
    setBusy(false);
    if (ok && data) {
      onAdded(data);
      setTitle("");
      setDetails("");
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
        placeholder="Details (optional)"
        rows={2}
        className="w-full px-2.5 py-1.5 border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={add}
          disabled={busy || !title.trim()}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-white text-xs font-bold uppercase tracking-wider transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: GREEN, ...OXANIUM }}
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
