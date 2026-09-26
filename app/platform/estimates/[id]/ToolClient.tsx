"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Check, ChevronLeft, ChevronRight, Copy, Globe, History, Info, LayoutDashboard, Loader2, MoreHorizontal, Pencil, Play, Power, SlidersHorizontal, Sparkles, Trash2, Users } from "lucide-react";
import BackLink from "@/components/BackLink";
import PageTitle from "@/components/PageTitle";
import SectionHeader from "@/components/SectionHeader";
import Monogram from "@/components/Monogram";
import StatusChip from "@/components/StatusChip";
import EmptyState from "@/components/EmptyState";
import { Chip, InfoTip } from "@/components/ds";
import { Input, Textarea } from "@/components/Input";
import { EstimatorRunnerPanel, valuesToForm } from "@/components/EstimatorRunner";
import { useAssistant } from "@/components/AssistantContext";
import { confirmSheet } from "@/components/ConfirmSheet";
import { QuickMenu, type MenuAnchor, type QuickAction } from "@/components/QuickMenu";
import { moneyExact } from "@/components/EstimatorControls";
import RatesToConfirm from "@/components/RatesToConfirm";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { money, shortDate } from "@/lib/statuses";
import { useUnsavedWarning } from "@/lib/use-unsaved-warning";
import type { EstimatorSpec } from "@/lib/estimator";
import { sanitizePublicConfig, type EstimatorPublicConfig } from "@/lib/estimator-public";
import BuildPanel, { type BuiltTool } from "../BuildPanel";
import EstimatorEditor, { type EditorSection } from "../EstimatorEditor";
import PublishPanel from "../PublishPanel";
import SharePanel from "../SharePanel";
import { toolFacts } from "../EstimatesClient";

/**
 * One tool's page, laid out like a client's page: back link + stamps, the
 * name as the page title (rename in place), then the sections — Overview ·
 * Try it · Ask Atlas (how most owners change a tool) · Web form (one switch,
 * the link right there) · Leads (everyone who used it) · Library · Advanced
 * (the hand editor) · History.
 *
 * Desktop: a Settings-style left rail, one panel at a time. Phones: the
 * iOS-Settings pattern — Overview IS the index, a row pushes into one
 * section with "‹ Tool name" at the top, and the browser back returns to
 * the index. The section rides in the URL as ?s= either way; the section
 * itself is React state so a tap always lands even when the URL fallback
 * (a ?s= the server rendered with) says otherwise.
 */

export type ToolRecord = {
  id: string;
  name: string;
  description: string | null;
  spec: EstimatorSpec | null;
  usesAtlas: boolean;
  isActive: boolean;
  runs: number;
  assists: number;
  isPublic: boolean;
  publicSlug: string | null;
  publicConfig: EstimatorPublicConfig;
  publicViews: number;
  publicCalcs: number;
  submissions: number;
  /** Copied from a Library listing */
  sourceListingId?: string | null;
  updatedAt: string;
};

/** One person who used the tool: a website lead (request) or a quote started from an in-app run. */
export type LeadRow = {
  key: string;
  /** ISO */
  at: string;
  contactId: string;
  contactName: string;
  via: "Web form" | "In app";
  amount: number | null;
  status: { kind: "request" | "quote"; value: string };
  href: string;
  quoteNumber?: number;
};

type Section = "overview" | "try" | "atlas" | "website" | "leads" | "share" | "advanced" | "history";
type AdvancedTab = Exclude<EditorSection, "history">;

const SECTIONS: { key: Section; label: string; icon: typeof Play; manager?: boolean }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "try", label: "Try it", icon: Play },
  { key: "atlas", label: "Ask Atlas", icon: Sparkles, manager: true },
  { key: "website", label: "Web form", icon: Globe, manager: true },
  { key: "leads", label: "Leads", icon: Users },
  { key: "share", label: "Library", icon: BookOpen, manager: true },
  { key: "advanced", label: "Advanced", icon: SlidersHorizontal, manager: true },
  { key: "history", label: "History", icon: History, manager: true },
];
const LEGACY: Record<string, Section> = { questions: "advanced", pricing: "advanced", words: "advanced" };

function merge(t: Record<string, unknown>, prev: ToolRecord): ToolRecord {
  return {
    ...prev,
    ...(typeof t.name === "string" ? { name: t.name } : {}),
    ...(typeof t.description === "string" || t.description === null ? { description: t.description as string | null } : {}),
    ...(t.spec ? { spec: t.spec as EstimatorSpec } : {}),
    ...(typeof t.usesAtlas === "boolean" ? { usesAtlas: t.usesAtlas } : {}),
    ...(typeof t.isActive === "boolean" ? { isActive: t.isActive } : {}),
    ...(typeof t.isPublic === "boolean" ? { isPublic: t.isPublic } : {}),
    ...(typeof t.publicSlug === "string" || t.publicSlug === null ? { publicSlug: t.publicSlug as string | null } : {}),
    ...(t.publicConfig ? { publicConfig: sanitizePublicConfig(t.publicConfig) } : {}),
    ...(typeof t.updatedAt === "string" ? { updatedAt: t.updatedAt } : {}),
  };
}

const isPhone = () => typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;

const LEADS_GRID = "lg:grid-cols-[120px_minmax(0,1fr)_90px_110px_130px_40px]";

export default function ToolClient({
  tool: initial,
  manager,
  companySlug,
  companyName = "",
  companyIndustry = null,
  baseUrl,
  tz,
  leads,
  initialSection,
  initialPrompt = "",
  resumeBuildId = null,
}: {
  tool: ToolRecord;
  manager: boolean;
  companySlug: string;
  companyName?: string;
  companyIndustry?: string | null;
  baseUrl: string;
  tz: string;
  leads: LeadRow[];
  initialSection?: string;
  /** Atlas (the chat) sent the owner here with a change request — Ask Atlas builds it at once. */
  initialPrompt?: string;
  /** An Atlas change to this tool still running on the server — the Ask Atlas panel picks it up. */
  resumeBuildId?: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const atlas = useAssistant();
  const [tool, setTool] = useState(initial);
  useEffect(() => setTool(initial), [initial]);
  const allowed = useMemo(() => SECTIONS.filter((s) => !s.manager || manager), [manager]);

  // ?s= names the section; legacy tab names map into Advanced; a change
  // still building opens on Ask Atlas so it's seen landing
  const resolve = useCallback(
    (raw: string | null | undefined, first = false): Section => {
      const s = raw ? LEGACY[raw] ?? raw : first && (resumeBuildId || initialPrompt) ? "atlas" : "overview";
      return allowed.some((x) => x.key === s) ? (s as Section) : "overview";
    },
    [allowed, resumeBuildId, initialPrompt]
  );
  const sParam = params.get("s") ?? initialSection ?? null;
  const [section, setSection] = useState<Section>(() => resolve(sParam, true));
  // follow the URL after the first render (back button, a pushState from go())
  const paramsKey = params.toString();
  const lastParamsRef = useRef(paramsKey);
  useEffect(() => {
    if (lastParamsRef.current === paramsKey) return;
    lastParamsRef.current = paramsKey;
    setSection(resolve(params.get("s")));
  }, [paramsKey, params, resolve]);

  const [advTab, setAdvTab] = useState<AdvancedTab>(sParam === "pricing" || sParam === "words" ? sParam : "questions");
  const [busy, setBusy] = useState<"active" | "delete" | "publish" | "rates" | "words" | "guidance" | "assist" | null>(null);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  const [copied, setCopied] = useState(false);
  const [runKey, setRunKey] = useState(0);
  // rename in place: the title turns into two fields
  const [words, setWords] = useState<{ name: string; description: string } | null>(null);
  // "How Atlas fills it in" guidance (spec.assist.instructions)
  const [guidance, setGuidance] = useState(initial.spec?.assist?.instructions ?? "");
  useEffect(() => setGuidance(initial.spec?.assist?.instructions ?? ""), [initial]);

  // Unsaved edits anywhere on the page (the Web form options, the guidance
  // card, a rename in progress): leaving the page asks first
  // (useUnsavedWarning), and so does switching sections — the Web form
  // panel unmounts when its section changes.
  const [panelDirty, setPanelDirty] = useState(false);
  const guidanceDirty = guidance.trim() !== (tool.spec?.assist?.instructions ?? "");
  const wordsDirty = words !== null && (words.name !== tool.name || words.description !== (tool.description ?? ""));
  const dirty = panelDirty || guidanceDirty || wordsDirty;
  useUnsavedWarning(dirty);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const sectionRef = useRef(section);
  sectionRef.current = section;

  const go = useCallback(async (s: Section, tab?: AdvancedTab) => {
    if (s !== sectionRef.current && dirtyRef.current) {
      const ok = await confirmSheet({ title: "Leave without saving?", message: "You have unsaved changes — they'll be lost.", confirmLabel: "Discard Changes", destructive: true });
      if (!ok) return;
      setPanelDirty(false);
    }
    if (tab) setAdvTab(tab);
    setSection(s);
    try {
      const url = new URL(window.location.href);
      if (s === "overview") url.searchParams.delete("s");
      else url.searchParams.set("s", s);
      // phones push (back returns to the index); desktop just keeps the URL current
      if (isPhone()) {
        window.history.pushState(null, "", url.toString());
        window.scrollTo({ top: 0 });
      } else window.history.replaceState(null, "", url.toString());
    } catch {
      /* ignore */
    }
  }, []);

  const spec = tool.spec;
  const placeholders = spec?.placeholders ?? [];
  const facts = spec ? toolFacts({ spec }, atlas.name) : ["no longer compiles"];
  const hostedUrl = tool.isPublic && tool.publicSlug ? `${baseUrl}/book/${companySlug}/estimate/${tool.publicSlug}` : "";
  const published = Boolean(tool.isPublic && tool.publicSlug);
  const assessed = Boolean(spec?.inputs.some((i) => i.askAtlas));

  // Overview: the sample jobs priced by the live rules (free dry runs)
  const [samplePrices, setSamplePrices] = useState<Record<string, number | null>>({});
  useEffect(() => {
    if (!spec || !spec.samples?.length || section !== "overview") return;
    let cancelled = false;
    (async () => {
      const out: Record<string, number | null> = {};
      for (const s of spec.samples ?? []) {
        const { data } = await postJson<{ ok?: boolean; subtotal?: number }>(`/api/app/estimators/${tool.id}/run?dry=1`, { inputs: valuesToForm(spec, s.inputs) });
        out[s.label] = data && data.ok && typeof data.subtotal === "number" ? data.subtotal : null;
      }
      if (!cancelled) setSamplePrices(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [spec, section, tool.id]);

  async function patch(body: Record<string, unknown>, kind: NonNullable<typeof busy>): Promise<boolean> {
    setBusy(kind);
    setError("");
    const { ok, data } = await postJson<Record<string, unknown> & { error?: string }>(`/api/app/estimators/${tool.id}`, body, "PATCH");
    setBusy(null);
    if (!ok || !data || !("id" in data)) {
      setError(typeof data?.error === "string" ? data.error : GENERIC_ERROR);
      return false;
    }
    setTool((t) => merge(data, t));
    router.refresh();
    return true;
  }

  async function remove() {
    if (
      !(await confirmSheet({
        title: `Delete “${tool.name}”?`,
        message: "Quotes already made with it are untouched. The tool and its history are gone for good.",
        confirmLabel: "Delete Tool",
        destructive: true,
      }))
    )
      return;
    setBusy("delete");
    const { ok, data } = await postJson(`/api/app/estimators/${tool.id}`, undefined, "DELETE");
    setBusy(null);
    if (!ok) setError(data?.error ?? GENERIC_ERROR);
    else router.push("/app/estimates");
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(hostedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  /** Overview: "Publish as a web form" publishes on the spot and shows the link. */
  async function publishNow() {
    if (tool.isPublic) {
      go("website");
      return;
    }
    if (await patch({ isPublic: true }, "publish")) go("website");
  }

  /** Overview: tick a rate off — the spec minus that line, saved as a manual edit. */
  async function confirmRate(index: number) {
    if (!spec) return;
    const next = { ...spec, placeholders: (spec.placeholders ?? []).filter((_, i) => i !== index) };
    await patch({ spec: next }, "rates");
  }

  async function saveWords() {
    if (!words) return;
    const name = words.name.trim();
    if (!name) {
      setError("Give the tool a name.");
      return;
    }
    if (await patch({ name, description: words.description.trim() || null }, "words")) setWords(null);
  }

  async function saveGuidance() {
    if (!spec) return;
    const next = { ...spec, assist: { ...(spec.assist ?? {}), instructions: guidance.trim() || undefined } };
    await patch({ spec: next }, "guidance");
  }

  /**
   * The Atlas fill-in switch — separate from the rules the builder writes.
   * Off = every answer is typed (free); turning it off also makes any
   * Atlas-assessed question a plain one, so the switch is never stuck on.
   */
  async function toggleAssist(on: boolean) {
    if (!spec) return;
    const next = {
      ...spec,
      assist: on ? { instructions: guidance.trim() || spec.assist?.instructions } : null,
      inputs: on ? spec.inputs : spec.inputs.map((i) => (i.askAtlas ? { ...i, askAtlas: undefined } : i)),
    };
    await patch({ spec: next }, "assist");
  }
  // fill-in needs a question Atlas can answer (a number, a choice, a count, a yes/no) — text-only tools have nothing to fill
  const fillable = Boolean(spec?.inputs.some((i) => i.type !== "text"));

  function run() {
    setRunKey((k) => k + 1);
    void go("try");
  }

  const menuActions: QuickAction[] = [
    { key: "rename", label: "Rename", icon: Pencil, onSelect: () => setWords({ name: tool.name, description: tool.description ?? "" }) },
    ...(published ? [{ key: "copy", label: copied ? "Link copied" : "Copy web form link", icon: Copy, onSelect: () => void copyLink() } as QuickAction] : []),
    { key: "power", label: tool.isActive ? "Turn off" : "Turn on", icon: Power, disabled: busy !== null, onSelect: () => void patch({ isActive: !tool.isActive }, "active") },
    { key: "delete", label: "Delete", icon: Trash2, destructive: true, disabled: busy !== null, onSelect: () => void remove() },
  ];

  const runner = spec ? { id: tool.id, name: tool.name, description: tool.description, usesAtlas: tool.usesAtlas, spec } : null;
  const advTabs: { key: AdvancedTab; label: string }[] = [
    { key: "questions", label: "Questions" },
    { key: "pricing", label: "Pricing" },
    { key: "words", label: "Words" },
  ];
  const editorSection: EditorSection = section === "history" ? "history" : advTab;
  const sectionLabel = SECTIONS.find((s) => s.key === section)?.label ?? "";

  const subline: Record<Section, string> = {
    overview: "",
    try: "Answer the questions, see the breakdown, start a quote.",
    atlas: `“Add a gate option at $250.” “Make the middle package the popular one.”`,
    website: published ? "Published — share the link or embed it on your site." : "One switch — a link to share and an embed code for your site.",
    leads: leads.length === 0 ? "Everyone who uses this tool, and what they were quoted." : `${leads.length} ${leads.length === 1 ? "person has" : "people have"} used it.`,
    share: "Share it with other businesses, or update your listing.",
    advanced: "Questions, pricing and words, by hand.",
    history: "Every version of the rules — restore any of them.",
  };

  const pills = (
    <>
      {!tool.isActive && <Chip>Off</Chip>}
      {published && <Chip tone="primary">Published</Chip>}
      {tool.sourceListingId && <Chip>From the Library</Chip>}
    </>
  );

  const railItem = (s: (typeof SECTIONS)[number]) => {
    const active = section === s.key;
    return (
      <button key={s.key} type="button" onClick={() => go(s.key)} className={`flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-sm transition-colors ${active ? "bg-[color:var(--ds-primary-soft)] font-semibold text-[color:var(--ds-primary)]" : "font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}>
        <s.icon size={16} className={active ? undefined : "text-gray-400"} />
        {s.label}
        {s.key === "leads" && leads.length > 0 && <span className="ml-auto text-xs font-normal tabular-nums text-gray-400">{leads.length}</span>}
      </button>
    );
  };

  const indexRow = (s: (typeof SECTIONS)[number]) => (
    <button key={s.key} type="button" onClick={() => (s.key === "try" ? run() : go(s.key))} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-gray-100">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[color:var(--ds-primary-soft)] text-[color:var(--ds-primary)]">
        <s.icon size={17} strokeWidth={2.25} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-gray-900">{s.key === "atlas" ? `Change it — ask ${atlas.name}` : s.label}</span>
        <span className="block truncate text-xs text-gray-500">{subline[s.key]}</span>
      </span>
      {s.key === "leads" && leads.length > 0 && <span className="text-sm tabular-nums text-gray-400">{leads.length}</span>}
      <ChevronRight size={16} className="shrink-0 text-gray-300" />
    </button>
  );

  const leadRow = (l: LeadRow) => (
    <Link key={l.key} href={l.href} prefetch={false} className={`block px-4 py-3 transition-colors hover:bg-gray-50 active:bg-gray-100 lg:grid lg:items-center lg:gap-4 lg:py-2.5 ${LEADS_GRID}`}>
      {/* phone row */}
      <div className="flex min-w-0 items-center gap-3 lg:hidden">
        <Monogram name={l.contactName} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 flex-1 truncate text-[15.5px] font-semibold text-gray-900">{l.contactName}</p>
            <StatusChip kind={l.status.kind} status={l.status.value} />
          </div>
          <p className="mt-0.5 truncate text-[13px] text-gray-500">
            {l.via} · {shortDate(l.at, tz)}
            {l.amount !== null ? ` · ${money(l.amount)}` : ""}
            {l.quoteNumber ? ` · Quote #${l.quoteNumber}` : ""}
          </p>
        </div>
      </div>
      {/* desktop grid */}
      <span className="hidden text-sm text-gray-500 lg:block">{shortDate(l.at, tz)}</span>
      <span className="hidden min-w-0 lg:block">
        <span className="block truncate text-sm font-medium text-gray-900">{l.contactName}</span>
        {l.quoteNumber && <span className="block truncate text-xs text-gray-500">Quote #{l.quoteNumber}</span>}
      </span>
      <span className="hidden text-sm text-gray-500 lg:block">{l.via}</span>
      <span className="hidden text-sm tabular-nums text-gray-900 lg:block">{l.amount !== null ? money(l.amount) : "—"}</span>
      <span className="hidden lg:block">
        <StatusChip kind={l.status.kind} status={l.status.value} />
      </span>
      <ChevronRight size={14} className="hidden shrink-0 text-gray-400 lg:block" />
    </Link>
  );

  return (
    <div className="mx-auto max-w-5xl p-4 pb-24 lg:p-8">
      {/* ── header: desktop always, phones only on the index ── */}
      <div className={section === "overview" ? "" : "hidden lg:block"}>
        <div className="mb-4 flex items-center gap-3">
          <BackLink href="/app/estimates" />
          {pills}
        </div>
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          {words ? (
            <form
              className="min-w-0 flex-1 space-y-2 sm:max-w-lg"
              onSubmit={(e) => {
                e.preventDefault();
                void saveWords();
              }}
            >
              <Input value={words.name} onChange={(e) => setWords({ ...words, name: e.target.value })} maxLength={80} placeholder="Tool name" autoFocus className="w-full text-lg font-semibold" aria-label="Tool name" />
              <Input value={words.description} onChange={(e) => setWords({ ...words, description: e.target.value })} maxLength={200} placeholder="What it's for — shown under the name and in the list" className="w-full" aria-label="Description" />
              <div className="flex items-center gap-2">
                <button type="submit" disabled={busy === "words"} className="btn-primary h-9 justify-center">
                  {busy === "words" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
                </button>
                <button type="button" onClick={() => setWords(null)} className="h-9 rounded-lg px-3 text-sm font-medium text-gray-600 hover:bg-gray-100">
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="min-w-0">
              <PageTitle sub={tool.description || facts.join(" · ")}>
                {tool.name}
                {manager && (
                  <button type="button" onClick={() => setWords({ name: tool.name, description: tool.description ?? "" })} className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Rename">
                    <Pencil size={15} />
                  </button>
                )}
              </PageTitle>
            </div>
          )}
          <div className="flex shrink-0 items-center gap-2">
            {tool.isActive && spec && (
              <button type="button" onClick={run} className="btn-primary hidden h-10 justify-center lg:flex">
                <Play size={15} /> Run
              </button>
            )}
            {manager && (
              <button
                type="button"
                onClick={(e) => {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setMenu({ x: r.right, y: r.bottom + 4, alignRight: true });
                }}
                className="btn-tool-line flex h-10 w-10 items-center justify-center rounded-[10px] bg-white text-gray-500 hover:bg-gray-50"
                aria-label="More"
              >
                <MoreHorizontal size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── phone header inside a section: back to the index + the section's title ── */}
      {section !== "overview" && (
        <div className="mb-4 lg:hidden">
          <button type="button" onClick={() => go("overview")} className="-ml-1.5 flex max-w-full items-center gap-0.5 text-[15px] font-medium text-[color:var(--ds-primary)]">
            <ChevronLeft size={19} className="shrink-0" />
            <span className="truncate">{tool.name}</span>
          </button>
          <h2 className="mt-1 flex items-center gap-1.5 text-[22px] font-bold text-gray-900">
            {section === "atlas" ? `Ask ${atlas.name}` : sectionLabel}
            {subline[section] && <InfoTip>{subline[section]}</InfoTip>}
          </h2>
        </div>
      )}

      {manager && <QuickMenu open={menu !== null} anchor={menu} title={tool.name} actions={menuActions} onClose={() => setMenu(null)} />}

      {error && (
        <div role="alert" className="form-error mb-4">
          {error}
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[230px_minmax(0,1fr)] lg:items-start lg:gap-10">
        <nav className="sticky top-8 hidden lg:block">
          <div className="space-y-0.5">{allowed.map(railItem)}</div>
        </nav>

        <div className="min-w-0">
          {/* ── Overview (desktop panel · phone index) ── */}
          {section === "overview" && (
            <div className="space-y-4">
              {!spec && <div className="form-error">This tool&apos;s saved rules no longer compile. Restore an earlier version under History, or rebuild it.</div>}

              {placeholders.length > 0 && manager && <RatesToConfirm items={placeholders} onDone={(i) => void confirmRate(i)} onOpenPricing={() => go("advanced", "pricing")} />}

              {spec && spec.samples && spec.samples.length > 0 && (
                <div className="ds-card overflow-hidden">
                  <SectionHeader className="px-4 pt-4 sm:px-5" title="What it prices" hint="Sample jobs, priced by today's rules." />
                  <dl className="mt-3 grid grid-cols-1 divide-y divide-gray-100 border-t border-gray-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                    {spec.samples.map((s) => (
                      <div key={s.label} className="flex items-baseline justify-between gap-3 px-4 py-3 sm:block sm:px-5">
                        <dt className="text-xs font-medium text-gray-500">{s.label}</dt>
                        <dd className="numeral-ledger text-lg font-semibold tabular-nums text-gray-900 sm:mt-0.5">{s.label in samplePrices ? (samplePrices[s.label] === null ? <span className="text-sm font-medium text-gray-400">didn&apos;t run</span> : moneyExact(samplePrices[s.label] as number)) : <span className="text-sm font-medium text-gray-400">…</span>}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              {/* phones: the index rows; desktop: the three things people come here for */}
              <div className="ds-card divide-y divide-gray-100 overflow-hidden lg:hidden">{allowed.filter((s) => s.key !== "overview").map(indexRow)}</div>

              <div className="ds-card hidden divide-y divide-gray-100 lg:block">
                <button type="button" onClick={run} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50">
                  <Play size={16} className="text-[color:var(--ds-primary)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-900">Try it</span>
                    <span className="block text-xs text-gray-500">{subline.try}</span>
                  </span>
                  <ChevronRight size={14} className="text-gray-400" />
                </button>
                {manager && (
                  <button type="button" onClick={() => go("atlas")} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50">
                    <Sparkles size={16} className="text-[color:var(--ds-primary)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-900">Change it — just tell {atlas.name}</span>
                      <span className="block text-xs text-gray-500">{subline.atlas}</span>
                    </span>
                    <ChevronRight size={14} className="text-gray-400" />
                  </button>
                )}
                {manager && (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Globe size={16} className="text-[color:var(--ds-primary)]" />
                    <button type="button" onClick={() => void publishNow()} disabled={busy === "publish"} className="min-w-0 flex-1 text-left">
                      <span className="block text-sm font-medium text-gray-900">{tool.isPublic ? "Published as a web form" : "Publish as a web form"}</span>
                      <span className="block truncate text-xs text-gray-500">{tool.isPublic ? `Share the link or embed it on your site · ${hostedUrl}` : "One tap — you get a link to share and an embed code for your website."}</span>
                    </button>
                    {busy === "publish" ? (
                      <Loader2 size={14} className="animate-spin text-gray-400" />
                    ) : tool.isPublic ? (
                      <button type="button" onClick={() => void copyLink()} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-gray-200 px-2 text-xs font-medium text-gray-700 hover:bg-gray-100">
                        {copied ? <Check size={12} className="text-[color:var(--ds-good)]" /> : <Copy size={12} />} {copied ? "Copied" : "Copy link"}
                      </button>
                    ) : null}
                  </div>
                )}
                <button type="button" onClick={() => go("leads")} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50">
                  <Users size={16} className="text-[color:var(--ds-primary)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-900">Leads</span>
                    <span className="block text-xs text-gray-500">{subline.leads}</span>
                  </span>
                  <ChevronRight size={14} className="text-gray-400" />
                </button>
              </div>

              {manager && spec && (
                <div className="ds-card p-4 sm:p-5">
                  <button type="button" role="switch" aria-checked={tool.usesAtlas} disabled={busy !== null || (!tool.usesAtlas && !fillable)} onClick={() => void toggleAssist(!tool.usesAtlas)} className="flex w-full items-center justify-between gap-3 text-left disabled:opacity-60">
                    <span className="min-w-0">
                      <span className="block text-[14.5px] font-semibold text-[color:var(--ds-ink)]">{atlas.name} fill-in</span>
                      <span className="ds-small mt-0.5 block">{tool.usesAtlas ? `On — someone can add a photo or describe the job and ${atlas.name} fills in the answers it can. Uses tokens per use; typing the answers stays free.${assessed ? ` Turning it off also makes the question${spec.inputs.filter((i) => i.askAtlas).length === 1 ? "" : "s"} ${atlas.name} assesses plain.` : ""}` : fillable ? `Off — every answer is typed in, free. Turn it on and someone can add a photo or describe the job instead; ${atlas.name} fills in what it can.` : `Nothing to fill in — this tool only has text questions. Add a number, choice, count or yes/no question first.`}</span>
                    </span>
                    <span className="relative h-7 w-12 shrink-0 rounded-full transition-colors" style={{ backgroundColor: tool.usesAtlas ? "var(--ds-primary)" : "var(--ds-line-strong)" }} aria-hidden>
                      {busy === "assist" ? <Loader2 size={14} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" /> : <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${tool.usesAtlas ? "translate-x-[26px]" : "translate-x-1"}`} />}
                    </span>
                  </button>
                  {tool.usesAtlas && (
                    <>
                      {!(spec.assist?.instructions ?? "").trim() && (
                        <div className="mt-3 flex items-start gap-2.5 rounded-lg bg-[color:var(--ds-warn-soft)] px-3 py-2.5 text-xs text-[color:var(--ds-warn)]">
                          <Info size={15} className="mt-0.5 shrink-0" />
                          <span>
                            <span className="font-semibold">Give {atlas.name} instructions for this job.</span> Without them it fills the form with trade-typical guesses. Say what to look for in a photo or description, what to assume when it can&apos;t tell, and what it must never guess — for example: &ldquo;A two-car driveway is about 500 sq ft. Count the garage as one story. If the stains aren&apos;t visible, assume moderate. Never guess the fence length.&rdquo;
                          </span>
                        </div>
                      )}
                      <p className="mt-3 text-xs font-medium text-gray-700">What to look for, what to assume when it can&apos;t tell, what it must never guess</p>
                      <Textarea value={guidance} onChange={(e) => setGuidance(e.target.value)} rows={3} maxLength={1000} placeholder="e.g. A two-car driveway is about 500 sq ft. Count the garage as one story. If the photo doesn't show the stains, assume moderate. Never guess the fence length — ask for it." className="mt-1.5 w-full" />
                      <div className="mt-2 flex items-center justify-end gap-3">
                        <span className="text-xs text-gray-500">{guidanceDirty ? "Unsaved" : ""}</span>
                        <button type="button" disabled={busy !== null || !guidanceDirty} onClick={() => void saveGuidance()} className="btn-primary h-9 justify-center">
                          {busy === "guidance" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save guidance
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {(tool.runs > 0 || tool.publicViews > 0) && (
                <p className="px-1 text-xs text-gray-500">
                  {tool.runs > 0 ? `Run ${tool.runs.toLocaleString()} time${tool.runs === 1 ? "" : "s"} in the app` : ""}
                  {tool.runs > 0 && tool.publicViews > 0 ? " · " : ""}
                  {tool.publicViews > 0 ? `website: ${tool.publicViews.toLocaleString()} views → ${tool.publicCalcs.toLocaleString()} estimates → ${tool.submissions.toLocaleString()} leads` : ""}
                </p>
              )}
            </div>
          )}

          {/* ── Try it ── */}
          {section === "try" && runner && (
            <div className="ds-card p-4 sm:p-5">
              <EstimatorRunnerPanel key={runKey} inline estimators={[runner]} onClose={() => go("overview")} showSamples={manager} />
            </div>
          )}

          {/* ── Ask Atlas — stays mounted (hidden) across sections so a change in progress is still there when you come back; the app-wide bar covers it meanwhile ── */}
          {manager && (
            <div className={section === "atlas" ? "ds-card p-4 sm:p-5" : "hidden"}>
              <SectionHeader size="block" className="mb-3 hidden lg:block" title={`Change “${tool.name}”`} hint="Say what should be different. The current version is kept under History." />
              {/* not keyed on updatedAt on purpose: the finished card ("Done — the changes are saved", the list of changes) must stay on screen after the save refreshes the page */}
              <BuildPanel
                compact
                visible={section === "atlas"}
                estimatorId={tool.id}
                toolName={tool.name}
                resumeBuildId={resumeBuildId}
                initialPrompt={initialPrompt}
                autoStart={Boolean(initialPrompt)}
                placeholder="e.g. Raise sealant to $0.50, add a gate option at $250, make the middle package the recommended one"
                onBuilt={(t: BuiltTool) => {
                  setTool((prev) => merge(t, prev));
                  router.refresh();
                }}
                onTry={run}
              />
            </div>
          )}

          {/* ── Leads ── */}
          {section === "leads" && (
            <div className="ds-card overflow-hidden">
              {leads.length === 0 ? (
                <EmptyState compact title="Nobody has used this tool yet" body="Website leads and quotes started from it land here." />
              ) : (
                <>
                  <div className="divide-y divide-gray-100">
                    <div className={`hidden bg-gray-50 px-4 py-2 text-xs font-medium text-gray-500 lg:grid lg:gap-4 ${LEADS_GRID}`}>
                      <span>When</span>
                      <span>Who</span>
                      <span>Via</span>
                      <span>Estimate</span>
                      <span>Status</span>
                      <span></span>
                    </div>
                    {leads.map(leadRow)}
                  </div>
                  <div className="flex items-center justify-between gap-4 border-t-2 border-double border-gray-300 bg-gray-50/60 px-4 py-2.5">
                    <span className="flex items-center gap-1 text-xs font-medium text-gray-500">
                      {leads.length} {leads.length === 1 ? "lead" : "leads"}
                      <InfoTip>Website leads also carry a “Website estimate” source on the Leads board.</InfoTip>
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Advanced: the hand editor ── */}
          {section === "advanced" && manager && spec && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex rounded-full border border-gray-200 bg-gray-100 p-1">
                {advTabs.map((t) => (
                  <button key={t.key} type="button" onClick={() => setAdvTab(t.key)} className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium ${advTab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-600"}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              <p className="hidden text-xs text-gray-500 sm:block">Most changes are quicker to ask {atlas.name} for.</p>
            </div>
          )}
          {manager && spec && (
            <div className={section === "advanced" || section === "history" ? "" : "hidden"}>
              <EstimatorEditor tool={{ id: tool.id, name: tool.name, description: tool.description, spec, usesAtlas: tool.usesAtlas }} section={editorSection} onSaved={() => router.refresh()} />
            </div>
          )}

          {/* ── Library ── */}
          {section === "share" && manager && <SharePanel toolId={tool.id} toolName={tool.name} companyName={companyName} companyIndustry={companyIndustry} />}

          {/* ── Web form ── */}
          {section === "website" && manager && (
            <PublishPanel
              tool={{ id: tool.id, name: tool.name, usesAtlas: tool.usesAtlas, assessed, isPublic: tool.isPublic, publicSlug: tool.publicSlug, publicConfig: tool.publicConfig, publicViews: tool.publicViews, publicCalcs: tool.publicCalcs, submissions: tool.submissions }}
              companySlug={companySlug}
              baseUrl={baseUrl}
              onDirty={setPanelDirty}
              onSaved={(t) => {
                setTool((prev) => merge(t as Record<string, unknown>, prev));
                router.refresh();
              }}
            />
          )}
        </div>
      </div>

      {/* phones: Run docks as a floating pill on the index (no transform — iOS drops the glass blur on transformed elements) */}
      {section === "overview" && tool.isActive && spec && (
        <button type="button" onClick={run} className="btn-primary glass-tinted fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 mx-auto w-max rounded-full px-6 py-3 text-[15px] lg:hidden">
          <Play size={15} /> Run this tool
        </button>
      )}
    </div>
  );
}
