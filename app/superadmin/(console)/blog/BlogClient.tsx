"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpToLine, ExternalLink, EyeOff, PenLine, Rocket, Save, Sparkles, Trash2, Undo2 } from "lucide-react";
import { Button, Card, Chip, DsPage, PageHeader } from "@/components/ds";
import { Input, Select, Textarea } from "@/components/Input";
import { confirmSheet } from "@/components/ConfirmSheet";
import { BLOG_PATH, BLOG_TOPICS, blogDate, type BlogStatus } from "@/lib/blog-shared";

export type BlogRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  tag: string;
  keyword: string | null;
  helpSlug: string | null;
  body: string;
  words: number;
  status: BlogStatus;
  heldReason: string | null;
  /** "YYYY-MM-DD" a queued post goes up */
  goesUp: string | null;
  publishedAt: string | null;
  createdAt: string;
  editedAt: string | null;
  model: string | null;
  tokensIn: number;
  tokensOut: number;
};

type Settings = { enabled: boolean; publishHour: number; queueTarget: number; guidance: string };

const STATUS: Record<BlogStatus, { label: string; tone: "neutral" | "primary" | "good" | "warn" }> = {
  QUEUED: { label: "Queued", tone: "primary" },
  PUBLISHED: { label: "Live", tone: "good" },
  HELD: { label: "Held", tone: "warn" },
  PULLED: { label: "Pulled", tone: "neutral" },
};

function hourLabel(h: number): string {
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${ampm}`;
}

async function send(url: string, method: "PATCH" | "POST" | "DELETE", body?: Record<string, unknown>): Promise<{ ok: boolean; data: Record<string, unknown> | null }> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: res.ok, data };
}

export default function BlogClient({
  rows,
  settings,
  postedToday,
  aiReady,
  maxHeld,
}: {
  rows: BlogRow[];
  settings: Settings;
  postedToday: boolean;
  aiReady: boolean;
  maxHeld: number;
}) {
  const router = useRouter();
  const [form, setForm] = useState(settings);
  const [busy, setBusy] = useState<"save" | "write" | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const queued = rows.filter((r) => r.status === "QUEUED");
  const held = rows.filter((r) => r.status === "HELD");
  const live = rows.filter((r) => r.status === "PUBLISHED");
  const pulled = rows.filter((r) => r.status === "PULLED");
  const dirty = JSON.stringify(form) !== JSON.stringify(settings);

  async function save() {
    setBusy("save");
    setError("");
    setNote("");
    const r = await send("/api/superadmin/blog", "PATCH", form);
    setBusy(null);
    if (!r.ok) return setError(String(r.data?.error ?? "Could not save."));
    setNote("Saved.");
    router.refresh();
  }

  async function writeNow() {
    setBusy("write");
    setError("");
    setNote("Sonnet is writing. This takes a minute or two.");
    const r = await send("/api/superadmin/blog", "POST", { action: "write" });
    setBusy(null);
    if (!r.ok) {
      setNote("");
      return setError(String(r.data?.error ?? "The write failed."));
    }
    setNote(r.data?.status === "HELD" ? "Written, but held: open it under Held to see why." : "Written and added to the end of the queue.");
    router.refresh();
  }

  const eyebrow = [
    form.enabled && settings.enabled ? "On" : "Off",
    `${queued.length} queued`,
    `${live.length} live`,
    postedToday ? "today's post is up" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <DsPage>
      <PageHeader
        eyebrow={eyebrow}
        title="Blog"
        info={`workbenchfsm.com${BLOG_PATH}. Claude Sonnet writes posts ahead into the queue; once a day, at the hour below (Central time), the hourly job puts the first queued post on the site. A post you publish by hand counts as that day's post. When the queue is short, one more post is written each hour. A post that fails a check (a WorkBench price typed in, a real customer's name, too short) is held and never goes up on its own; writing pauses while ${maxHeld} are held.`}
        actions={
          <Button size="sm" variant="soft" icon={Sparkles} loading={busy === "write"} disabled={Boolean(busy) || !aiReady} onClick={() => void writeNow()}>
            Write one now
          </Button>
        }
      />
      {!aiReady && <p className="mt-4 text-[13px] text-[color:var(--ds-warn)]">ANTHROPIC_API_KEY is not set on this environment: nothing can be written.</p>}

      <Card className="mt-6 p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="ds-label mb-1 block">Daily posting</span>
            <Select value={form.enabled ? "on" : "off"} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.value === "on" }))} className="w-full">
              <option value="on">On: one post a day</option>
              <option value="off">Off: nothing is written or posted</option>
            </Select>
          </label>
          <label className="block">
            <span className="ds-label mb-1 block">Goes up at (Central)</span>
            <Select value={String(form.publishHour)} onChange={(e) => setForm((f) => ({ ...f, publishHour: Number(e.target.value) }))} className="w-full">
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="ds-label mb-1 block">Posts written ahead</span>
            <Input
              type="number"
              min={1}
              max={30}
              value={String(form.queueTarget)}
              onChange={(e) => setForm((f) => ({ ...f, queueTarget: Number(e.target.value) || 1 }))}
              className="w-full"
            />
          </label>
          <label className="block sm:col-span-3">
            <span className="ds-label mb-1 block">Notes for the writer (topics to cover or avoid, tone)</span>
            <Textarea
              value={form.guidance}
              onChange={(e) => setForm((f) => ({ ...f, guidance: e.target.value }))}
              rows={3}
              placeholder="Example: Write more about HVAC and plumbing. Never mention financing."
              className="w-full"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button size="sm" icon={Save} loading={busy === "save"} disabled={Boolean(busy) || !dirty} onClick={() => void save()}>
            Save
          </Button>
          {error && <span className="text-[13px] text-[color:var(--ds-bad)]">{error}</span>}
          {note && <span className="text-[13px] text-[color:var(--ds-muted)]">{note}</span>}
        </div>
        <p className="mt-3 text-[12.5px] text-[color:var(--ds-muted)]">Categories rotate: {BLOG_TOPICS.join(", ")}.</p>
      </Card>

      <Section title="Queue" empty={settings.enabled ? "Empty. The next hourly run writes one, or press Write one now." : "Empty. Turn daily posting on, or press Write one now."} rows={queued} />
      {held.length > 0 && <Section title="Held for review" rows={held} />}
      <Section title="Live on the site" empty="Nothing has gone up yet." rows={live} />
      {pulled.length > 0 && <Section title="Pulled" rows={pulled} />}
    </DsPage>
  );
}

function Section({ title, rows, empty }: { title: string; rows: BlogRow[]; empty?: string }) {
  return (
    <section className="mt-8">
      <h2 className="ds-h2">
        {title} <span className="font-normal text-[color:var(--ds-muted)]">· {rows.length}</span>
      </h2>
      <div className="mt-3 space-y-3">
        {rows.length === 0 && empty && (
          <Card className="px-6 py-7 text-center">
            <p className="ds-small">{empty}</p>
          </Card>
        )}
        {rows.map((r, i) => (
          <PostRow key={r.id} row={r} first={i === 0} />
        ))}
      </div>
    </section>
  );
}

function PostRow({ row, first }: { row: BlogRow; first: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState({ title: row.title, summary: row.summary, tag: row.tag, slug: row.slug, body: row.body });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const st = STATUS[row.status];
  const dirty = edit.title !== row.title || edit.summary !== row.summary || edit.tag !== row.tag || edit.slug !== row.slug || edit.body !== row.body;

  async function act(kind: string, method: "PATCH" | "DELETE", body?: Record<string, unknown>) {
    setBusy(kind);
    setError("");
    setNote("");
    const r = await send(`/api/superadmin/blog/${row.id}`, method, body);
    setBusy(null);
    if (!r.ok) return setError(String(r.data?.error ?? "Something went wrong."));
    const problems = Array.isArray(r.data?.problems) ? (r.data?.problems as string[]) : [];
    if (kind === "save") setNote(problems.length ? `Saved. Still to fix: ${problems.join(" ")}` : "Saved.");
    router.refresh();
  }

  const when =
    row.status === "QUEUED" && row.goesUp
      ? `Goes up ${blogDate(row.goesUp)}`
      : row.status === "PUBLISHED" && row.publishedAt
        ? `Went up ${blogDate(new Date(row.publishedAt))}`
        : `Written ${blogDate(new Date(row.createdAt))}`;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <button type="button" className="min-w-0 text-left" onClick={() => setOpen((o) => !o)}>
          <h3 className="ds-h2">{row.title}</h3>
          <p className="ds-small">
            {when} · {row.tag} · {row.words} words
            {row.keyword ? ` · for "${row.keyword}"` : ""}
            {row.editedAt ? " · edited" : ""}
          </p>
          {row.status === "HELD" && row.heldReason && <p className="mt-1 text-[13px] text-[color:var(--ds-warn)]">{row.heldReason}</p>}
        </button>
        <Chip tone={st.tone}>{st.label}</Chip>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          className="ds-btn ds-btn-ghost ds-btn-sm"
          href={row.status === "PUBLISHED" ? `${BLOG_PATH}/${row.slug}` : `${BLOG_PATH}/${row.slug}?preview=1`}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={15} strokeWidth={2.2} aria-hidden />
          {row.status === "PUBLISHED" ? "Open" : "Preview"}
        </a>
        <Button size="sm" variant="ghost" icon={PenLine} onClick={() => setOpen((o) => !o)}>
          {open ? "Close" : "Edit"}
        </Button>
        {row.status === "QUEUED" && !first && (
          <Button size="sm" variant="ghost" icon={ArrowUpToLine} loading={busy === "next"} disabled={Boolean(busy)} onClick={() => void act("next", "PATCH", { action: "next" })}>
            Post next
          </Button>
        )}
        {(row.status === "HELD" || row.status === "PULLED") && (
          <Button size="sm" variant="ghost" icon={Undo2} loading={busy === "queue"} disabled={Boolean(busy)} onClick={() => void act("queue", "PATCH", { action: "queue" })}>
            Add to the queue
          </Button>
        )}
        {row.status !== "PUBLISHED" && (
          <Button
            size="sm"
            variant="ghost"
            icon={Rocket}
            loading={busy === "publish"}
            disabled={Boolean(busy)}
            onClick={async () => {
              const ok = await confirmSheet({
                title: "Put this post on the site now?",
                message: "It goes live at workbenchfsm.com/blog right away and counts as today's post, so the daily post skips today.",
                confirmLabel: "Publish now",
              });
              if (ok) void act("publish", "PATCH", { action: "publish" });
            }}
          >
            Publish now
          </Button>
        )}
        {row.status !== "PULLED" && (
          <Button
            size="sm"
            variant="ghost"
            icon={EyeOff}
            loading={busy === "pull"}
            disabled={Boolean(busy)}
            onClick={async () => {
              if (row.status === "PUBLISHED") {
                const ok = await confirmSheet({
                  title: "Take this post off the site?",
                  message: "Its page stops working for anyone who has the link. You can put it back in the queue later.",
                  confirmLabel: "Take it down",
                  destructive: true,
                });
                if (!ok) return;
              }
              void act("pull", "PATCH", { action: "pull" });
            }}
          >
            {row.status === "PUBLISHED" ? "Take down" : "Pull"}
          </Button>
        )}
        {row.status !== "PUBLISHED" && (
          <Button
            size="sm"
            variant="ghost"
            icon={Trash2}
            loading={busy === "delete"}
            disabled={Boolean(busy)}
            onClick={async () => {
              const ok = await confirmSheet({ title: "Delete this post?", message: "It is gone for good.", confirmLabel: "Delete post", destructive: true });
              if (ok) void act("delete", "DELETE");
            }}
          >
            Delete
          </Button>
        )}
        {error && <span className="text-[13px] text-[color:var(--ds-bad)]">{error}</span>}
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="ds-label mb-1 block">Title</span>
              <Input value={edit.title} onChange={(e) => setEdit((f) => ({ ...f, title: e.target.value }))} className="w-full" />
            </label>
            <label className="block sm:col-span-2">
              <span className="ds-label mb-1 block">Summary (the list and the Google description)</span>
              <Textarea value={edit.summary} onChange={(e) => setEdit((f) => ({ ...f, summary: e.target.value }))} rows={2} className="w-full" />
            </label>
            <label className="block">
              <span className="ds-label mb-1 block">Category</span>
              <Input value={edit.tag} onChange={(e) => setEdit((f) => ({ ...f, tag: e.target.value }))} className="w-full" />
            </label>
            <label className="block">
              <span className="ds-label mb-1 block">Address {row.status === "PUBLISHED" ? "(fixed once live)" : ""}</span>
              <Input
                value={edit.slug}
                disabled={row.status === "PUBLISHED"}
                onChange={(e) => setEdit((f) => ({ ...f, slug: e.target.value }))}
                className="w-full"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="ds-label mb-1 block">Post (## for a heading, - for a bullet, **Bold.** to start a bullet with a title, 1. for steps, a blank line between paragraphs)</span>
              <Textarea value={edit.body} onChange={(e) => setEdit((f) => ({ ...f, body: e.target.value }))} rows={22} className="w-full font-mono text-[13px]" />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" icon={Save} loading={busy === "save"} disabled={Boolean(busy) || !dirty} onClick={() => void act("save", "PATCH", edit)}>
              Save changes
            </Button>
            {note && <span className="text-[13px] text-[color:var(--ds-muted)]">{note}</span>}
          </div>
          <p className="text-[12.5px] text-[color:var(--ds-muted)]">
            {row.model ? `Written by ${row.model}, ${row.tokensIn.toLocaleString()} tokens in / ${row.tokensOut.toLocaleString()} out.` : "Written by hand."}
            {row.helpSlug ? ` Links the Help guide "${row.helpSlug}".` : ""}
          </p>
        </div>
      )}
    </Card>
  );
}
