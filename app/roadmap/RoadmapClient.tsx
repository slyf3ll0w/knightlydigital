"use client";

import { useState } from "react";
import { Bug, Check, Eye, EyeOff, Loader2, Lock, Plus, RotateCcw, Sparkle, StickyNote, Trash2, Wrench } from "lucide-react";
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

interface Note {
  id: string;
  body: string;
  isPublic: boolean;
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
  initialNotes = [],
  canEdit,
  app = false,
}: {
  initialItems: Item[];
  /** Public notes for everyone; the server also includes private ones for editors. */
  initialNotes?: Note[];
  canEdit: boolean;
  /** In-app rendering (/app/roadmap): no marketing hero, app card styling. */
  app?: boolean;
}) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [busyId, setBusyId] = useState<string | null>(null);
  const columnCls = app ? "card-ledger" : "bg-white border border-gray-200";

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
    <div style={app ? undefined : { backgroundColor: "#F7F7F5", minHeight: "100vh" }}>
      {/* ── Header: marketing hero, or a plain app-page heading ── */}
      {app ? (
        <div className="pt-4 lg:pt-8 px-4 lg:px-8 max-w-5xl mx-auto">
          <h1 className="numeral-ledger text-2xl font-semibold text-gray-900 mb-1">
            Upcoming Features
          </h1>
          <p className="text-sm text-gray-500">
            What we&apos;re building next for the Hub — and everything that&apos;s already shipped.
          </p>
        </div>
      ) : (
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
      )}

      {/* ── Board ── */}
      <section
        className={
          app
            ? "max-w-5xl mx-auto px-4 lg:px-8 py-6 lg:py-8 flex flex-col gap-10"
            : "max-w-5xl mx-auto px-6 lg:px-8 py-14 flex flex-col gap-12"
        }
      >
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
                <div className={columnCls}>
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
                <div className={columnCls}>
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

        {/* ── Notes ── */}
        {(canEdit || notes.some((n) => n.isPublic)) && (
          <div>
            <div className="flex items-center gap-2.5 mb-1" style={{ color: "#111827" }}>
              <span style={{ color: GREEN }}>
                <StickyNote size={18} />
              </span>
              <h2 className="text-2xl font-bold" style={OXANIUM}>
                Notes
              </h2>
            </div>
            <p className="text-sm text-gray-500 mb-5">
              {canEdit
                ? "Public notes show on this page for everyone; private notes are only visible to editors."
                : "Notes from the team about what's on the board."}
            </p>

            <div className={`grid gap-5 items-start ${canEdit ? "md:grid-cols-2" : ""}`}>
              <NotesColumn
                variant="public"
                notes={notes.filter((n) => n.isPublic)}
                canEdit={canEdit}
                columnCls={columnCls}
                busyId={busyId}
                setBusyId={setBusyId}
                setNotes={setNotes}
              />
              {canEdit && (
                <NotesColumn
                  variant="private"
                  notes={notes.filter((n) => !n.isPublic)}
                  canEdit={canEdit}
                  columnCls={columnCls}
                  busyId={busyId}
                  setBusyId={setBusyId}
                  setNotes={setNotes}
                />
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function NotesColumn({
  variant,
  notes,
  canEdit,
  columnCls,
  busyId,
  setBusyId,
  setNotes,
}: {
  variant: "public" | "private";
  notes: Note[];
  canEdit: boolean;
  columnCls: string;
  busyId: string | null;
  setBusyId: (id: string | null) => void;
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
}) {
  const isPublic = variant === "public";

  async function toggleVisibility(note: Note) {
    setBusyId(note.id);
    const { ok, data } = await postJson<Note>(
      `/api/roadmap/notes/${note.id}`,
      { isPublic: !note.isPublic },
      "PATCH"
    );
    setBusyId(null);
    if (ok && data) setNotes((all) => all.map((n) => (n.id === note.id ? { ...n, ...data } : n)));
  }

  async function removeNote(note: Note) {
    if (!confirm("Delete this note?")) return;
    setBusyId(note.id);
    const { ok } = await postJson(`/api/roadmap/notes/${note.id}`, undefined, "DELETE");
    setBusyId(null);
    if (ok) setNotes((all) => all.filter((n) => n.id !== note.id));
  }

  return (
    <div className={`${columnCls} ${isPublic ? "" : "border-amber-300"}`}>
      <div
        className={`px-4 py-2.5 text-xs font-bold uppercase tracking-widest border-b flex items-center gap-1.5 ${
          isPublic ? "border-gray-200" : "border-amber-200 bg-amber-50 text-amber-700"
        }`}
        style={isPublic ? { color: "#6B7280", ...OXANIUM } : OXANIUM}
      >
        {isPublic ? <Eye size={13} /> : <Lock size={13} />}
        {isPublic ? "Public notes" : "Private notes — editors only"}
      </div>
      <ul className="divide-y divide-gray-100">
        {notes.length === 0 && (
          <li className="px-4 py-4 text-sm text-gray-400 italic">
            {isPublic ? "No notes yet." : "Nothing here — only you two can see this column."}
          </li>
        )}
        {notes.map((note) => (
          <li key={note.id} className="px-4 py-3 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-700 whitespace-pre-line">{note.body}</p>
              <p className="text-[11px] text-gray-400 mt-1" style={OXANIUM}>
                {shipDate(note.createdAt)}
              </p>
            </div>
            {canEdit && (
              <span className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => toggleVisibility(note)}
                  disabled={busyId === note.id}
                  title={note.isPublic ? "Make private" : "Make public"}
                  className="text-gray-300 hover:text-gray-600 transition-colors"
                >
                  {busyId === note.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : note.isPublic ? (
                    <EyeOff size={14} />
                  ) : (
                    <Eye size={14} />
                  )}
                </button>
                <button
                  onClick={() => removeNote(note)}
                  disabled={busyId === note.id}
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
      {canEdit && (
        <AddNoteForm
          isPublic={isPublic}
          onAdded={(n) => setNotes((all) => [n, ...all])}
        />
      )}
    </div>
  );
}

function AddNoteForm({ isPublic, onAdded }: { isPublic: boolean; onAdded: (note: Note) => void }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!body.trim()) return;
    setBusy(true);
    const { ok, data } = await postJson<Note>("/api/roadmap/notes", { body, isPublic });
    setBusy(false);
    if (ok && data) {
      onAdded(data);
      setBody("");
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full px-4 py-2.5 border-t border-gray-200 text-xs font-semibold text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors flex items-center gap-1.5"
      >
        <Plus size={13} /> Add {isPublic ? "public" : "private"} note
      </button>
    );
  }

  return (
    <div className="border-t border-gray-200 p-3 flex flex-col gap-2">
      <textarea
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={isPublic ? "Note everyone can see…" : "Note only editors can see…"}
        rows={3}
        className="w-full px-2.5 py-1.5 border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={add}
          disabled={busy || !body.trim()}
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
