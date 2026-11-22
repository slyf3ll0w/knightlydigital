"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Eye,
  GripVertical,
  History,
  Lock,
  Mic,
  Monitor,
  RotateCcw,
  SlidersHorizontal,
  Smartphone,
  Square,
  Undo2,
  X,
} from "lucide-react";
import { Button, Card, Chip, DsPage, InfoTip, PageHeader } from "@/components/ds";
import { Input, Select, Textarea } from "@/components/Input";
import BottomSheet from "@/components/BottomSheet";
import { confirmSheet } from "@/components/ConfirmSheet";
import { useAssistant } from "@/components/AssistantContext";
import { AtlasMark } from "@/components/AtlasIcon";
import ClientThemePhotoPicker from "@/components/ClientThemePhotoPicker";
import { listenOnce, speechInputKind, type ListenHandle } from "@/lib/voice-chat-client";
import {
  BAND_STYLES,
  BOOKING_HEROES,
  BUTTON_STYLES,
  COPY_LIMITS,
  CORNER_STYLES,
  DEFAULT_OVERLAY,
  LOGIN_LAYOUTS,
  LOGO_PLACEMENTS,
  LOGO_SIZES,
  OVERLAY_MAX,
  OVERLAY_MIN,
  PORTAL_PINNED_SECTIONS,
  PORTAL_SECTIONS,
  THEME_FONTS,
  parseClientTheme,
  type ClientThemeSpec,
  type PortalSectionId,
  type ThemeContext,
  type ThemeProblem,
} from "@/lib/client-theme-spec";
import {
  STYLE_PRESETS,
  applyStylePreset,
  designTurnsToSend,
  photoOn,
  popUndo,
  pushUndo,
  readableOverlay,
  setThemePhoto,
  stylePresetOf,
  type DesignTurn,
  type StylePreset,
  type UndoStack,
} from "@/lib/client-theme-presets";
import type { ThemeRowJson, ThemeStateJson } from "@/lib/client-theme-store";
import type { ThemeBookingItem } from "@/lib/client-theme-route";

/**
 * Settings → Brand & client pages → Client pages (the AI page designer, Pro). Simplified 2026-11-20
 * (David: "very confusing… could Atlas design it within the Client Page
 * section"):
 *
 *   left   Atlas, a short conversation on the page (POST /api/app/assistant
 *          with scope "client-pages": only the design tools, same meter as the
 *          drawer). Each answer saves the draft; the page re-reads it and the
 *          preview refreshes.
 *          "Adjust it yourself" (collapsed): Colors, Photo, Style, Words, then
 *          "More options" (collapsed) for everything else, History and Reset.
 *   right  a large live preview: Portal / Sign-in / Booking / a form.
 *   bar    status, Undo (this session's drafts), Publish.
 *
 * Phone (iOS-style): Atlas first, then a Preview row (full-screen swipe) and an
 * "Adjust it yourself" row (a sheet), Undo + Publish above the tab bar.
 *
 * One local spec is the source of truth: every edit is checked here with the
 * same parseClientTheme the server runs (instant contrast fixes), then
 * autosaved as the draft (PUT /api/app/client-theme/draft, replace). Clients
 * never see a draft; Publish / History / Reset go through
 * POST /api/app/client-theme/publish — the route Atlas's cards call in the drawer.
 */

type Spec = ClientThemeSpec & Record<string, unknown>;
type MoreKey = "font" | "logo" | "band" | "shape" | "background" | "portal" | "login" | "booking" | "words";
type Surface = "portal" | "login" | "booking" | "form";
type Turn = DesignTurn & { error?: boolean };

/** The kit button has no disabled look of its own. */
const OFF = "disabled:cursor-not-allowed disabled:opacity-45";

const MORE: { key: MoreKey; label: string }[] = [
  { key: "font", label: "Font" },
  { key: "logo", label: "Logo" },
  { key: "band", label: "Band" },
  { key: "shape", label: "Buttons and corners" },
  { key: "background", label: "Page background" },
  { key: "portal", label: "Portal sections" },
  { key: "login", label: "Sign-in page" },
  { key: "booking", label: "Booking page" },
  { key: "words", label: "Words on each item" },
];

const SURFACES: { key: Surface; label: string }[] = [
  { key: "portal", label: "Portal" },
  { key: "login", label: "Sign-in" },
  { key: "booking", label: "Booking" },
  { key: "form", label: "A form" },
];

const LABEL: Record<string, string> = {
  sm: "Small",
  md: "Medium",
  lg: "Large",
  "band-left": "Left",
  "band-center": "Center",
  solid: "Solid",
  gradient: "Gradient",
  photo: "Photo",
  outline: "Outline",
  pill: "Pill",
  square: "Square",
  soft: "Soft",
  round: "Round",
  "band-top": "Band on top",
  split: "Photo beside",
  "photo-full": "Photo behind",
  plain: "Plain",
  "photo-left": "Photo beside",
  "photo-behind": "Photo behind",
};

const SECTION_NAME: Record<PortalSectionId, string> = {
  balance: "Balance due",
  todo: "To do and new messages",
  requestWork: "Request work",
  comingUp: "Coming up",
  completedWork: "Completed work",
  agreements: "Agreements",
  records: "Your records",
};

/** Problem paths the four basics show; anything else lives under More options. */
const BASIC_PATHS = ["colors.band", "colors.accent", "band", "portal.welcome", "booking.heading", "booking.hero"];

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}[`);

/** Which More options row shows a problem. */
function moreKeyOf(path: string): MoreKey {
  const top = path.split(/[.[]/)[0];
  if (top === "font") return "font";
  if (top === "logo") return "logo";
  if (top === "band") return "band";
  if (top === "buttons" || top === "corners") return "shape";
  if (top === "colors") return "background";
  if (top === "portal") return "portal";
  if (top === "login") return "login";
  if (top === "itemWords") return "words";
  return "booking";
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function canon(spec: unknown, ctx: ThemeContext): string {
  return JSON.stringify(parseClientTheme(spec ?? { v: 1 }, ctx).theme);
}

/** Drop empty objects / blank strings so a cleared field reads as "default". */
function prune(spec: Spec): Spec {
  const out = clone(spec) as Record<string, unknown>;
  for (const [k, v] of Object.entries(out)) {
    if (v === "" || v === undefined || v === null) delete out[k];
    else if (typeof v === "object" && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      for (const [k2, v2] of Object.entries(o)) {
        if (v2 === "" || v2 === undefined || v2 === null) delete o[k2];
        else if (typeof v2 === "object" && !Array.isArray(v2) && Object.keys(v2 as object).length === 0) delete o[k2];
      }
      if (Object.keys(o).length === 0) delete out[k];
    }
  }
  out.v = 1;
  return out as Spec;
}

function when(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

async function errorText(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error || "That didn't go through. Try again.";
}

/** One Atlas turn from POST /api/app/assistant (NDJSON: progress lines, then done or error). */
async function readAtlasTurn(res: Response): Promise<{ reply?: string; recap?: string; error?: string }> {
  const failed = "Atlas couldn't answer that just now. Try again.";
  if (!res.body || !(res.headers.get("content-type") ?? "").includes("ndjson")) {
    const body = (await res.json().catch(() => null)) as { reply?: string; recap?: string; error?: string } | null;
    if (!res.ok) return { error: body?.error || failed };
    return body?.reply ? { reply: body.reply, recap: body.recap } : { error: failed };
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let out: { reply?: string; recap?: string; error?: string } = { error: failed };
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const o = JSON.parse(line) as { type?: string; reply?: string; recap?: string; error?: string };
        if (o.type === "done") out = { reply: o.reply || "Done. Have a look at the preview.", recap: o.recap };
        else if (o.type === "error") out = { error: o.error || failed };
      } catch {
        /* a partial line — wait for the rest */
      }
    }
    if (done) break;
  }
  return out;
}

/** Review gallery only (fixture): a canned Atlas answer, no network. */
function fixtureAtlas(text: string, spec: Spec): { reply: string; spec: Spec } {
  const s = clone(spec);
  if (/photo/i.test(text)) {
    return { reply: "I put your crew photo behind the band and at the top of the booking page. Press Publish when you like it.", spec: setThemePhoto(s, true, "fixture-photo", s.colors?.band) };
  }
  s.colors = { ...(s.colors ?? {}), band: "#14532D", accent: "#15803D" };
  return { reply: "I made the band a deep forest green and the buttons a brighter green so they stand out. Press Publish when you like it.", spec: s };
}

export default function ClientPagesClient({
  initial,
  items,
  ctx: initialCtx,
  companyName,
  slug,
  fixture = false,
  fixtureTurns,
}: {
  initial: ThemeStateJson;
  /** Active booking items (id, name, slug, description, showOnPage, hubForm). */
  items: Pick<ThemeBookingItem, "id" | "name" | "slug" | "description" | "showOnPage" | "hubForm">[];
  ctx: ThemeContext;
  companyName: string;
  slug: string;
  /** Review gallery only: no saving, previews render the spec on the fake Brightwire account, Atlas answers from a script. */
  fixture?: boolean;
  /** Review gallery only: a conversation to start with. */
  fixtureTurns?: Turn[];
}) {
  const atlas = useAssistant();
  const atlasName = atlas.name || "Atlas";
  const [published, setPublished] = useState<ThemeRowJson | null>(initial.published);
  const [draft, setDraft] = useState<ThemeRowJson | null>(initial.draft);
  const [versions, setVersions] = useState<ThemeRowJson[]>(initial.versions);
  const [spec, setSpec] = useState<Spec>(() => clone((initial.draft?.spec ?? initial.published?.spec ?? { v: 1 }) as Spec));
  const specRef = useRef(spec);
  specRef.current = spec;
  const [assetIds, setAssetIds] = useState<string[]>([...initialCtx.assetIds]);
  const ctx = useMemo<ThemeContext>(() => ({ ...initialCtx, assetIds }), [initialCtx, assetIds]);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [surface, setSurface] = useState<Surface>("portal");
  const [device, setDevice] = useState<"phone" | "desktop">("desktop");
  const [formSlug, setFormSlug] = useState<string>(() => (items.find((i) => i.showOnPage) ?? items[0])?.slug ?? "");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreSection, setMoreSection] = useState<MoreKey | null>(null);
  const [adjustSheet, setAdjustSheet] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  const [undoStack, setUndoStack] = useState<UndoStack>([]);
  const [turns, setTurns] = useState<Turn[]>(fixtureTurns ?? []);
  const [atlasBusy, setAtlasBusy] = useState(false);
  const edited = useRef(false);
  const lastEdit = useRef(0);
  const saveTimer = useRef<number | null>(null);
  const saving = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setIsDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const parsed = useMemo(() => parseClientTheme(spec, ctx), [spec, ctx]);
  const problems = parsed.problems;
  const changed = canon(spec, ctx) !== canon(published?.spec, ctx);
  const canPublish = changed && problems.length === 0 && status !== "saving" && !busy && !atlasBusy && !fixture;
  const moreProblems = problems.filter((p) => !BASIC_PATHS.some((b) => under(p.path, b)));
  const bandColor = spec.colors?.band ?? ctx.defaultBand ?? "#0B57D8";

  /** Load everything from the server (after publish / discard / history). */
  const reload = useCallback(async (resetSpec: boolean) => {
    const res = await fetch("/api/app/client-theme/draft", { cache: "no-store" });
    if (!res.ok) throw new Error(await errorText(res));
    let s = (await res.json()) as ThemeStateJson;
    if (!s.draft) {
      // Always keep a draft to preview: a copy of what is live
      const made = await fetch("/api/app/client-theme/draft", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patch: {} }) });
      if (made.ok) s = { ...s, draft: ((await made.json()) as { draft: ThemeRowJson }).draft };
    }
    setPublished(s.published);
    setDraft(s.draft);
    setVersions(s.versions);
    if (resetSpec) {
      edited.current = false;
      setSpec(clone((s.draft?.spec ?? s.published?.spec ?? { v: 1 }) as Spec));
    }
    setPreviewKey((k) => k + 1);
    return s;
  }, []);

  // No draft yet (first visit, or just published elsewhere): make one so the preview has a link
  useEffect(() => {
    if (fixture || initial.draft) return;
    void reload(true).catch((e) => setError((e as Error).message));
  }, [fixture, initial.draft, reload]);

  const saveSpec = useCallback(async (s: Spec) => {
    const run = (async () => {
      try {
        const res = await fetch("/api/app/client-theme/draft", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spec: prune(s), replace: true }),
        });
        if (!res.ok) {
          setStatus("error");
          setError(await errorText(res));
          return;
        }
        const body = (await res.json()) as { draft: ThemeRowJson };
        setDraft(body.draft);
        setStatus("saved");
        setError(null);
        setPreviewKey((k) => k + 1);
      } catch {
        setStatus("error");
        setError("No connection: your change isn't saved yet.");
      }
    })();
    saving.current = run;
    await run;
    if (saving.current === run) saving.current = null;
  }, []);

  /** Save a pending edit now (before Atlas reads the draft). */
  const flushSave = useCallback(async () => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
      await saveSpec(specRef.current);
    } else if (saving.current) await saving.current;
  }, [saveSpec]);

  // Autosave: every edit becomes the draft (clients never see it)
  useEffect(() => {
    if (!edited.current || fixture) return;
    setStatus("saving");
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      void saveSpec(spec);
    }, 700);
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    };
  }, [spec, fixture, saveSpec]);

  // The fixture gallery has no saving: the preview follows the spec itself
  useEffect(() => {
    if (!fixture) return;
    const t = window.setTimeout(() => setPreviewKey((k) => k + 1), 400);
    return () => window.clearTimeout(t);
  }, [spec, fixture]);

  /** Every edit: one undo step per burst (typing a word is one step, not one per letter). */
  function commit(next: Spec) {
    const now = Date.now();
    if (now - lastEdit.current > 1200) setUndoStack((u) => pushUndo(u, specRef.current));
    lastEdit.current = now;
    edited.current = true;
    setSpec(next);
  }
  function edit(fn: (s: Spec) => Spec | void) {
    const next = clone(specRef.current);
    commit(fn(next) ?? next);
  }
  function setPart(group: string, key: string, value: unknown) {
    edit((s) => {
      const g = { ...((s[group] as Record<string, unknown>) ?? {}) };
      if (value === "" || value === null || value === undefined) delete g[key];
      else g[key] = value;
      if (Object.keys(g).length) s[group] = g;
      else delete s[group];
    });
  }
  function setTop(key: string, value: unknown) {
    edit((s) => {
      if (value === "" || value === null || value === undefined) delete s[key];
      else s[key] = value;
    });
  }

  function undo() {
    const back = popUndo(undoStack);
    if (!back) return;
    setUndoStack(back.stack);
    lastEdit.current = 0;
    edited.current = true;
    setSpec(back.spec);
  }

  /** Atlas saved a draft: take it as the page's spec (one undo step) and refresh the preview. */
  function takeDraft(next: Spec) {
    if (canon(next, ctx) === canon(specRef.current, ctx)) return;
    setUndoStack((u) => pushUndo(u, specRef.current));
    lastEdit.current = 0;
    // Already the saved draft: nothing to autosave
    edited.current = false;
    setSpec(clone(next));
    setPreviewKey((k) => k + 1);
  }

  async function askAtlas(text: string): Promise<boolean> {
    const said = text.trim();
    if (!said || atlasBusy) return false;
    const next: Turn[] = [...turns, { role: "user", content: said.slice(0, 2000) }];
    setTurns(next);
    setAtlasBusy(true);
    try {
      if (fixture) {
        await new Promise((r) => window.setTimeout(r, 900));
        const out = fixtureAtlas(said, specRef.current);
        takeDraft(out.spec);
        setTurns([...next, { role: "assistant", content: out.reply }]);
        return true;
      }
      await flushSave();
      const res = await fetch("/api/app/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        body: JSON.stringify({ scope: "client-pages", messages: designTurnsToSend(next.filter((t) => !t.error)) }),
      }).catch(() => null);
      if (!res) {
        setTurns([...next, { role: "assistant", content: "No connection. Try again in a moment.", error: true }]);
        return true;
      }
      const out = await readAtlasTurn(res);
      if (out.error) {
        setTurns([...next, { role: "assistant", content: out.error, error: true }]);
        return true;
      }
      setTurns([...next, { role: "assistant", content: out.reply ?? "", recap: out.recap }]);
      const s = await reload(false).catch(() => null);
      if (s?.draft) takeDraft(s.draft.spec as Spec);
      return true;
    } finally {
      setAtlasBusy(false);
    }
  }

  function previewSrc(which: Surface): string {
    if (fixture) {
      const doc = which === "portal" ? "hub" : which === "login" ? "login" : which === "booking" ? "book" : "form";
      return `/client-preview?doc=${doc}&brand=navy&themeSpec=${encodeURIComponent(JSON.stringify(prune(spec)))}`;
    }
    const token = draft?.previewToken;
    if (!token) return "about:blank";
    const t = encodeURIComponent(token);
    if (which === "portal") return `/client-preview?theme=${t}&doc=hub`;
    if (which === "login") return `/client-preview?theme=${t}&doc=login`;
    if (which === "booking") return `/book/${slug}?preview=1&theme=${t}`;
    return formSlug ? `/book/${slug}/${formSlug}?preview=1&theme=${t}` : `/client-preview?theme=${t}&doc=form`;
  }

  async function publish() {
    const ok = await confirmSheet({
      title: "Publish this look?",
      message: "Your sign-in page, client portal, booking page and forms change for every client right away. You can put an earlier look back from History.",
      confirmLabel: "Publish",
    });
    if (!ok) return;
    await run(async () => {
      await flushSave();
      const res = await fetch("/api/app/client-theme/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft: true }) });
      if (!res.ok) throw new Error(await errorText(res));
      await reload(true);
    });
  }

  async function discard() {
    const ok = await confirmSheet({ title: "Discard your changes?", message: "The draft goes back to the look your clients see now.", confirmLabel: "Discard changes", destructive: true });
    if (!ok) return;
    await run(async () => {
      const before = specRef.current;
      const res = await fetch("/api/app/client-theme/draft", { method: "DELETE" });
      if (!res.ok) throw new Error(await errorText(res));
      await reload(true);
      setUndoStack((u) => pushUndo(u, before));
      lastEdit.current = 0;
    });
  }

  async function useVersion(v: ThemeRowJson) {
    const ok = await confirmSheet({
      title: `Put version ${v.version} back?`,
      message: "It goes live for every client now, saved as a new version. Your current draft is kept.",
      confirmLabel: "Use this one",
    });
    if (!ok) return;
    await run(async () => {
      const res = await fetch("/api/app/client-theme/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: v.version }) });
      if (!res.ok) throw new Error(await errorText(res));
      await reload(false);
      setHistoryOpen(false);
    });
  }

  async function resetDefault() {
    const ok = await confirmSheet({
      title: "Go back to the default look?",
      message: "Your client pages go back to your logo and colors from Branding. Every version stays in History.",
      confirmLabel: "Reset to default",
      destructive: true,
    });
    if (!ok) return;
    await run(async () => {
      const res = await fetch("/api/app/client-theme/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reset: true }) });
      if (!res.ok) throw new Error(await errorText(res));
      await reload(false);
      setHistoryOpen(false);
    });
  }

  async function run(fn: () => Promise<void>) {
    if (fixture) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** The problems chip: open where the fix is. */
  function showProblems() {
    const first = moreProblems[0];
    if (first) setMoreSection(moreKeyOf(first.path));
    if (isDesktop) {
      setAdjustOpen(true);
      if (moreProblems.length) setMoreOpen(true);
    } else {
      setAdjustSheet(true);
      if (moreProblems.length) setMoreOpen(true);
    }
  }

  const statusText = fixture
    ? changed
      ? "Draft — not live yet"
      : "Preview only"
    : status === "saving"
      ? "Saving…"
      : status === "error"
        ? "Not saved"
        : changed
          ? "Draft — not live yet"
          : published
            ? "Live"
            : "Default look";

  const onAsset = (id: string | null) => id && setAssetIds((a) => (a.includes(id) ? a : [...a, id]));

  const atlasPanel = atlas.available ? (
    <AtlasDesigner name={atlasName} accent={atlas.accent} locked={atlas.locked} turns={turns} busy={atlasBusy} onSend={askAtlas} />
  ) : null;

  const adjustBody = (
    <div className="space-y-6">
      <Basics
        spec={spec}
        problems={problems}
        bandColor={bandColor}
        accentFallback={bandColor}
        setPart={setPart}
        commit={commit}
        onAsset={onAsset}
        fixture={fixture}
      />
      <div className="border-t border-[color:var(--ds-line)] pt-4">
        <button
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={moreOpen}
          className="flex w-full items-center gap-2 text-left text-[15px] font-semibold text-[color:var(--ds-ink)]"
          data-testid="theme-more"
        >
          More options
          {moreProblems.length > 0 && <Chip tone="bad">Needs a fix</Chip>}
          <ChevronDown size={18} className={`ml-auto text-[color:var(--ds-faint)] transition-transform ${moreOpen ? "rotate-180" : ""}`} />
        </button>
        {moreOpen && (
          <div className="mt-3">
            <div className="ds-card ds-divide overflow-hidden">
              {MORE.map((m) => {
                const open = moreSection === m.key;
                const fix = moreProblems.some((p) => moreKeyOf(p.path) === m.key);
                return (
                  <section key={m.key} data-testid={`theme-section-${m.key}`}>
                    <button type="button" className="ds-row w-full text-left" aria-expanded={open} onClick={() => setMoreSection(open ? null : m.key)}>
                      <span className="min-w-0 flex-1 text-[14.5px] font-medium text-[color:var(--ds-ink)]">{m.label}</span>
                      {fix && <Chip tone="bad">Fix</Chip>}
                      <ChevronRight size={16} className={`text-[color:var(--ds-faint)] transition-transform ${open ? "rotate-90" : ""}`} />
                    </button>
                    {open && (
                      <div className="px-4 pb-4 pt-1">
                        <MoreBody section={m.key} spec={spec} problems={problems} items={items} setPart={setPart} setTop={setTop} edit={edit} onAsset={onAsset} fixture={fixture} />
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" icon={History} onClick={() => setHistoryOpen(true)}>
                History
              </Button>
              <Button variant="ghost" icon={RotateCcw} onClick={discard} disabled={!changed || busy || fixture} className={OFF}>
                Discard changes
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const problemChip =
    problems.length > 0 ? (
      <button type="button" onClick={showProblems} className="inline-flex" data-testid="theme-problems">
        <Chip tone="bad" icon={AlertTriangle}>
          {problems.length === 1 ? "1 thing to fix before publishing" : `${problems.length} things to fix before publishing`}
        </Chip>
      </button>
    ) : null;

  return (
    <DsPage className="lg:max-w-[1480px]">
      <div data-client-pages>
        <PageHeader
          eyebrow="Settings"
          title="Client pages"
          info={
            <>
              How your sign-in page, client portal, booking page and forms look. Tell {atlasName} what you want, or adjust it yourself. Changes save as a
              draft only you can see; Publish puts them live. Quotes, invoices and emails keep your brand colors from Settings → Brand & client pages. Form questions are
              edited in Booking &amp; forms.
            </>
          }
        />
        {error && (
          <p role="alert" className="mt-4 rounded-[12px] bg-[color:var(--ds-bad-soft,#FEE2E2)] px-4 py-2.5 text-sm text-[color:var(--ds-bad)]">
            {error}
          </p>
        )}

        {/* ── Desktop: Atlas + adjust left, a large live preview right ── */}
        <div className="mt-6 hidden gap-6 lg:grid lg:grid-cols-[420px_minmax(0,1fr)]">
          <div className="space-y-4 pb-6">
            {atlasPanel}
            <Card className="p-5" data-testid="theme-adjust">
              <button
                type="button"
                onClick={() => setAdjustOpen((o) => !o)}
                aria-expanded={adjustOpen}
                className="flex w-full items-center gap-2 text-left"
              >
                <SlidersHorizontal size={18} className="text-[color:var(--ds-ink-2)]" />
                <span className="ds-h2">Adjust it yourself</span>
                <ChevronRight size={18} className={`ml-auto text-[color:var(--ds-faint)] transition-transform ${adjustOpen ? "rotate-90" : ""}`} />
              </button>
              {adjustOpen && <div className="mt-5">{adjustBody}</div>}
            </Card>
          </div>
          <aside className="sticky top-4 self-start">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <Segmented value={surface} options={SURFACES.map((s) => ({ value: s.key, label: s.label }))} onChange={(v) => setSurface(v as Surface)} label="Page to preview" />
              <span className="flex items-center gap-2">
                {surface === "form" && items.length > 1 && !fixture && (
                  <Select value={formSlug} onChange={(e) => setFormSlug(e.target.value)} aria-label="Form to preview" className="max-w-[200px] py-1.5">
                    {items.map((i) => (
                      <option key={i.id} value={i.slug}>
                        {i.name}
                      </option>
                    ))}
                  </Select>
                )}
                <Segmented
                  value={device}
                  options={[
                    { value: "desktop", label: "Desktop", icon: Monitor },
                    { value: "phone", label: "Phone", icon: Smartphone },
                  ]}
                  onChange={(v) => setDevice(v as "phone" | "desktop")}
                  label="Preview width"
                />
              </span>
            </div>
            <div className="ds-card relative flex justify-center overflow-hidden bg-[color:var(--ds-surface-2)] p-3">
              {isDesktop && (
                <iframe
                  key={`${surface}-${formSlug}-${previewKey}`}
                  src={previewSrc(surface)}
                  title={`Preview: ${SURFACES.find((s) => s.key === surface)?.label}`}
                  className="h-[calc(100vh-220px)] min-h-[620px] rounded-[10px] border-0 bg-white"
                  style={{ width: device === "phone" ? 390 : "100%", maxWidth: "100%" }}
                />
              )}
              {atlasBusy && <UpdatingBadge />}
            </div>
          </aside>
        </div>

        {/* Desktop bottom bar: sticks to the foot of the page column (never over the nav rail);
            the right padding keeps Publish clear of the floating Atlas buttons. */}
        <div className="sticky bottom-0 z-30 -mx-8 hidden border-t border-[color:var(--ds-line)] bg-[color:var(--ds-surface)]/95 backdrop-blur lg:block">
          <div className="flex items-center justify-end gap-3 py-3 pl-8 pr-[168px]">
            <span className="mr-auto flex items-center gap-3 text-sm text-[color:var(--ds-ink-2)]" data-testid="theme-status">
              <StatusDot live={!changed && Boolean(published)} draft={changed} />
              {statusText}
              {problemChip}
            </span>
            <Button variant="ghost" icon={Undo2} onClick={undo} disabled={undoStack.length === 0 || atlasBusy} className={OFF} data-testid="theme-undo">
              Undo
            </Button>
            <Button onClick={publish} disabled={!canPublish} loading={busy} data-testid="theme-publish" className={OFF}>
              Publish
            </Button>
          </div>
        </div>

        {/* ── Phone: Atlas first, then Preview and Adjust rows ── */}
        <div className="mt-5 space-y-4 pb-40 lg:hidden">
          {atlasPanel}
          <Card className="ds-divide overflow-hidden">
            <button type="button" className="ds-row w-full text-left" onClick={() => setPreviewOpen(true)} data-testid="theme-row-preview">
              <RowLead icon={Eye} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium text-[color:var(--ds-ink)]">Preview</span>
                <span className="ds-small block">{atlasBusy ? "Updating your preview…" : "Portal, sign-in, booking and a form"}</span>
              </span>
              <ChevronRight size={16} className="text-[color:var(--ds-faint)]" />
            </button>
            <button type="button" className="ds-row w-full text-left" onClick={() => setAdjustSheet(true)} data-testid="theme-row-adjust">
              <RowLead icon={SlidersHorizontal} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium text-[color:var(--ds-ink)]">Adjust it yourself</span>
                <span className="ds-small block truncate">{basicsSummary(spec)}</span>
              </span>
              {problems.length ? <Chip tone="bad">Fix</Chip> : null}
              <ChevronRight size={16} className="text-[color:var(--ds-faint)]" />
            </button>
          </Card>
        </div>
        <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 border-t border-[color:var(--ds-line)] bg-[color:var(--ds-surface)]/95 px-4 py-3 backdrop-blur lg:hidden">
          <p className="mb-2 flex items-center justify-center gap-2 text-center text-[13px] text-[color:var(--ds-ink-2)]">
            {problems.length > 0 ? (
              <button type="button" onClick={showProblems} className="text-[color:var(--ds-bad)] underline">
                {problems.length === 1 ? "1 thing to fix before publishing" : `${problems.length} things to fix before publishing`}
              </button>
            ) : (
              <>
                <StatusDot live={!changed && Boolean(published)} draft={changed} />
                {statusText}
              </>
            )}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" icon={Undo2} onClick={undo} disabled={undoStack.length === 0 || atlasBusy} className={OFF} aria-label="Undo" data-testid="theme-undo-phone">
              Undo
            </Button>
            <Button className={`flex-1 ${OFF}`} onClick={publish} disabled={!canPublish} loading={busy} data-testid="theme-publish-phone">
              {changed ? "Publish" : "Nothing new to publish"}
            </Button>
          </div>
        </div>

        <BottomSheet open={adjustSheet && isDesktop === false} onClose={() => setAdjustSheet(false)} title="Adjust it yourself" closeButton>
          <div className="ds max-h-[75vh] overflow-y-auto px-4 pb-8">{adjustBody}</div>
        </BottomSheet>

        {isDesktop === false && previewOpen && <PhonePreview onClose={() => setPreviewOpen(false)} srcOf={previewSrc} reloadKey={previewKey} />}

        {historyOpen && (
          <HistoryDrawer onClose={() => setHistoryOpen(false)} desktop={Boolean(isDesktop)}>
            <HistoryList versions={versions} publishedId={published?.id ?? null} busy={busy || fixture} onUse={useVersion} onReset={resetDefault} hasPublished={Boolean(published)} />
          </HistoryDrawer>
        )}
        <span className="sr-only">{companyName}</span>
      </div>
    </DsPage>
  );
}

// ── Atlas on the page ───────────────────────────────────────────────────

function AtlasDesigner({
  name,
  accent,
  locked,
  turns,
  busy,
  onSend,
}: {
  name: string;
  accent?: string;
  locked: boolean;
  turns: Turn[];
  busy: boolean;
  onSend: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const listen = useRef<ListenHandle | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const [canListen, setCanListen] = useState(false);
  useEffect(() => setCanListen(speechInputKind() !== "none"), []);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [turns.length, busy]);
  useEffect(() => () => listen.current?.cancel(), []);

  async function send() {
    if (!text.trim() || busy || locked) return;
    listen.current?.stop();
    const said = text;
    setText("");
    const ok = await onSend(said);
    if (!ok) setText(said);
  }

  /** Dictation: the words land in the box; the person presses send. */
  function mic() {
    if (listening) {
      listen.current?.stop();
      return;
    }
    setMicError(null);
    const base = text.trim() ? `${text.trim()} ` : "";
    setListening(true);
    listen.current = listenOnce({
      onInterim: (t) => setText(base + t),
      onFinal: (t) => {
        setText((base + t).trim() ? base + t : base.trim());
        setListening(false);
        listen.current = null;
      },
      onError: (m) => {
        setMicError(m);
        setListening(false);
        listen.current = null;
      },
      onBlocked: () => {
        setMicError("Microphone access is blocked for this site.");
        setListening(false);
        listen.current = null;
      },
    });
  }

  return (
    <Card className="p-5" data-testid="theme-atlas">
      <div className="mb-3 flex items-center gap-2.5">
        <AtlasMark size={30} accent={accent} />
        <h2 className="ds-h2">{name}</h2>
        <InfoTip>
          Tell {name} the look you want, in your own words: colors, a photo, a style, the words on your pages. Each answer changes your draft and the
          preview right away. Clients see nothing until you press Publish. Uses {name} tokens, like the chat.
        </InfoTip>
      </div>

      {(turns.length > 0 || busy) && (
        <div ref={list} className="mb-3 max-h-[340px] space-y-3 overflow-y-auto pr-1" aria-live="polite">
          {turns.map((t, i) =>
            t.role === "user" ? (
              <div key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-[color:var(--ds-primary)] px-3.5 py-2">
                <p data-selectable="" className="whitespace-pre-wrap text-sm font-medium text-[color:var(--ds-on-primary)]">
                  {t.content}
                </p>
              </div>
            ) : (
              <p
                key={i}
                data-selectable=""
                className={`mr-4 whitespace-pre-wrap px-0.5 text-sm leading-relaxed ${t.error ? "text-[color:var(--ds-bad)]" : "text-[color:var(--ds-ink)]"}`}
              >
                {t.content}
              </p>
            )
          )}
          {busy && (
            <p className="flex items-center gap-2 px-0.5 text-sm text-[color:var(--ds-ink-2)]" data-testid="theme-atlas-working">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--ds-primary)] opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[color:var(--ds-primary)]" />
              </span>
              Updating your preview…
            </p>
          )}
        </div>
      )}

      {locked ? (
        <p className="rounded-[12px] bg-[color:var(--ds-surface-2)] px-3 py-2.5 text-sm text-[color:var(--ds-ink-2)]">
          {name} is out of tokens for now. You can still adjust it yourself below.
        </p>
      ) : (
        <div className="rounded-[16px] border border-[color:var(--ds-line-strong)] bg-[color:var(--ds-surface)] p-2 focus-within:border-[color:var(--ds-primary)]">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={3}
            maxLength={2000}
            placeholder="Describe the look you want…"
            aria-label={`Describe the look you want to ${name}`}
            className="w-full resize-none border-0 bg-transparent px-2 py-1.5 text-[15px] shadow-none focus:ring-0"
            data-testid="theme-atlas-input"
          />
          <div className="flex items-center justify-end gap-2 px-1 pb-0.5">
            {micError && <span className="mr-auto text-[12px] text-[color:var(--ds-bad)]">{micError}</span>}
            {canListen && (
              <button
                type="button"
                onClick={mic}
                disabled={busy}
                aria-label={listening ? "Stop listening" : "Speak instead of typing"}
                title={listening ? "Stop listening" : "Speak instead of typing"}
                className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
                  listening ? "bg-[color:var(--ds-bad)] text-white" : "bg-[color:var(--ds-surface-2)] text-[color:var(--ds-ink)] hover:bg-[color:var(--ds-line)]"
                }`}
              >
                {listening ? <Square size={15} strokeWidth={2.4} /> : <Mic size={18} strokeWidth={2.2} />}
              </button>
            )}
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy || !text.trim()}
              aria-label="Send"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--ds-primary)] text-[color:var(--ds-on-primary)] transition-opacity disabled:opacity-40"
              data-testid="theme-atlas-send"
            >
              <ArrowUp size={18} strokeWidth={2.4} />
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function UpdatingBadge() {
  return (
    <span className="absolute left-1/2 top-6 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[color:var(--ds-surface)] px-4 py-2 text-[13px] font-medium text-[color:var(--ds-ink)] shadow-lg">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--ds-primary)] opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[color:var(--ds-primary)]" />
      </span>
      Updating your preview…
    </span>
  );
}

function StatusDot({ live, draft }: { live: boolean; draft: boolean }) {
  const color = draft ? "var(--ds-warn, #D97706)" : live ? "var(--ds-good, #16A34A)" : "var(--ds-faint)";
  return <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />;
}

function basicsSummary(spec: Spec): string {
  const style = STYLE_PRESETS.find((p) => p.id === stylePresetOf(spec))?.label ?? "Your own style";
  return [style, photoOn(spec) ? "photo on" : "no photo", spec.colors?.band || spec.colors?.accent ? "own colors" : "brand colors"].join(" · ");
}

// ── The four basics ─────────────────────────────────────────────────────

function Basics({
  spec,
  problems,
  bandColor,
  accentFallback,
  setPart,
  commit,
  onAsset,
  fixture,
}: {
  spec: Spec;
  problems: ThemeProblem[];
  bandColor: string;
  accentFallback: string;
  setPart: (group: string, key: string, value: unknown) => void;
  commit: (next: Spec) => void;
  onAsset: (id: string | null) => void;
  fixture: boolean;
}) {
  const at = (prefix: string) => problems.filter((p) => under(p.path, prefix));
  const c = spec.colors ?? {};
  const on = photoOn(spec);
  const [wantPhoto, setWantPhoto] = useState(on);
  useEffect(() => {
    if (on) setWantPhoto(true);
  }, [on]);
  const preset = stylePresetOf(spec);
  const photoProblems = [...at("band"), ...at("booking.hero")];
  const overlayFix = photoProblems.some((p) => p.path === "band.overlay") ? readableOverlay(bandColor) : null;

  return (
    <div className="space-y-6">
      <section data-testid="theme-basic-colors">
        <h3 className="mb-3 text-[15px] font-semibold text-[color:var(--ds-ink)]">Colors</h3>
        <div className="space-y-4">
          <ColorRow label="Band" info="The strip across the top with your logo. Text on it is picked white or dark to stay readable." value={c.band} onChange={(v) => setPart("colors", "band", v)} problems={at("colors.band")} />
          <ColorRow label="Buttons" info="Buttons, links and selected choices. They must stand out on white." value={c.accent} onChange={(v) => setPart("colors", "accent", v)} problems={at("colors.accent")} />
        </div>
      </section>

      <section data-testid="theme-basic-photo">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-[15px] font-semibold text-[color:var(--ds-ink)]">Photo</h3>
          <InfoTip>One photo behind the band and at the top of your booking page, under a layer of the band color so the words stay readable.</InfoTip>
          <span className="ml-auto">
            <Switch
              checked={on || wantPhoto}
              label="Show a photo"
              onChange={(v) => {
                setWantPhoto(v);
                if (v) {
                  if (spec.band?.imageId) commit(setThemePhoto(spec, true, spec.band.imageId, bandColor));
                } else if (on) commit(setThemePhoto(spec, false));
              }}
            />
          </span>
        </div>
        {(on || wantPhoto) && (
          <PhotoSlot
            fixture={fixture}
            label="Photo"
            value={spec.band?.imageId ?? null}
            onChange={(id) => {
              onAsset(id);
              commit(id ? setThemePhoto(spec, true, id, bandColor) : setThemePhoto(spec, false, null));
              if (!id) setWantPhoto(false);
            }}
          />
        )}
        {photoProblems.length > 0 && (
          <div className="mt-2 rounded-[10px] bg-[color:var(--ds-surface-2)] px-3 py-2">
            <Problems list={photoProblems} />
            {overlayFix !== null && (
              <button type="button" onClick={() => setPart("band", "overlay", overlayFix)} className="mt-2 text-[13px] font-medium text-[color:var(--ds-primary)]">
                Make the color layer stronger
              </button>
            )}
          </div>
        )}
      </section>

      <section data-testid="theme-basic-style">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-[15px] font-semibold text-[color:var(--ds-ink)]">Style</h3>
          <InfoTip>Sets the buttons, the card corners and the band together. Fine-tune each one under More options.</InfoTip>
        </div>
        <div role="radiogroup" aria-label="Style" className="grid grid-cols-3 gap-2.5">
          {STYLE_PRESETS.map((p) => (
            <StyleSwatch key={p.id} preset={p} selected={preset === p.id} band={bandColor} accent={c.accent ?? accentFallback} onPick={() => commit(applyStylePreset(spec, p.id))} />
          ))}
        </div>
        {preset === null && <p className="ds-small mt-2">Your own mix, from More options.</p>}
      </section>

      <section data-testid="theme-basic-words" className="space-y-4">
        <h3 className="text-[15px] font-semibold text-[color:var(--ds-ink)]">Words</h3>
        <CopyField label="Portal welcome line" max={COPY_LIMITS.welcome} value={spec.portal?.welcome} onChange={(v) => setPart("portal", "welcome", v)} problems={at("portal.welcome")} />
        <CopyField label="Booking page heading" max={COPY_LIMITS.heading} value={spec.booking?.heading} onChange={(v) => setPart("booking", "heading", v)} problems={at("booking.heading")} />
      </section>
    </div>
  );
}

/** A ready-made style, drawn small: a band, a card with its corners, a button with its shape. */
function StyleSwatch({ preset, selected, band, accent, onPick }: { preset: StylePreset; selected: boolean; band: string; accent: string; onPick: () => void }) {
  const radius = preset.corners === "square" ? 2 : preset.corners === "soft" ? 6 : 10;
  const bandBg = preset.band === "gradient" ? `linear-gradient(135deg, ${band}, color-mix(in srgb, ${band} 55%, #000))` : band;
  const btnRadius = preset.buttons === "pill" ? 999 : radius;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPick}
      data-style={preset.id}
      className={`rounded-[14px] border-2 p-2 text-left transition-colors ${
        selected ? "border-[color:var(--ds-primary)] bg-[color:var(--ds-primary-soft)]" : "border-[color:var(--ds-line)] hover:border-[color:var(--ds-line-strong)]"
      }`}
    >
      <span className="block overflow-hidden bg-[#F4F5F7]" style={{ borderRadius: radius + 2 }}>
        <span className="block h-5" style={{ background: bandBg }} />
        <span className="block p-1.5">
          <span className="block bg-white p-1.5 shadow-sm" style={{ borderRadius: radius }}>
            <span className="mb-1.5 block h-1 w-3/4 rounded bg-[#D7DAE0]" />
            <span className="block h-3.5 w-full" style={{ background: preset.buttons === "outline" ? "transparent" : accent, border: `1.5px solid ${accent}`, borderRadius: btnRadius }} />
          </span>
        </span>
      </span>
      <span className="mt-1.5 block text-center text-[13px] font-semibold text-[color:var(--ds-ink)]">{preset.label}</span>
    </button>
  );
}

// ── More options ────────────────────────────────────────────────────────

function MoreBody({
  section,
  spec,
  problems,
  items,
  setPart,
  setTop,
  edit,
  onAsset,
  fixture,
}: {
  section: MoreKey;
  spec: Spec;
  problems: ThemeProblem[];
  items: { id: string; name: string; description: string | null; showOnPage: boolean; hubForm: boolean }[];
  setPart: (group: string, key: string, value: unknown) => void;
  setTop: (key: string, value: unknown) => void;
  edit: (fn: (s: Spec) => Spec | void) => void;
  onAsset: (id: string | null) => void;
  fixture: boolean;
}) {
  const at = (prefix: string) => problems.filter((p) => under(p.path, prefix));

  if (section === "font") {
    return (
      <div className="space-y-2">
        <FieldLabel label="Headings font" info="Headings, the band title and buttons. Body text and amounts stay as they are." />
        <Select className="w-full" value={(spec.font as string) ?? ""} onChange={(e) => setTop("font", e.target.value)} aria-label="Headings font">
          <option value="">Default</option>
          {THEME_FONTS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </Select>
        <Problems list={at("font")} />
      </div>
    );
  }

  if (section === "logo") {
    return (
      <div className="space-y-4">
        <div>
          <FieldLabel label="Size" />
          <Segmented value={spec.logo?.size ?? "md"} options={LOGO_SIZES.map((v) => ({ value: v, label: LABEL[v] }))} onChange={(v) => setPart("logo", "size", v === "md" ? null : v)} label="Logo size" />
        </div>
        <div>
          <FieldLabel label="Placement" />
          <Segmented value={spec.logo?.placement ?? "band-left"} options={LOGO_PLACEMENTS.map((v) => ({ value: v, label: LABEL[v] }))} onChange={(v) => setPart("logo", "placement", v === "band-left" ? null : v)} label="Logo placement" />
        </div>
        <Problems list={at("logo")} />
      </div>
    );
  }

  if (section === "band") {
    const band = spec.band ?? {};
    const style = band.style ?? "solid";
    return (
      <div className="space-y-4">
        <div>
          <FieldLabel label="Band style" info="Photo uses the photo from Adjust it yourself → Photo." />
          <Segmented
            value={style}
            options={BAND_STYLES.filter((v) => v !== "photo" || band.imageId).map((v) => ({ value: v, label: LABEL[v] }))}
            onChange={(v) => setPart("band", "style", v === "solid" ? null : v)}
            label="Band style"
          />
        </div>
        {style === "photo" && (
          <div>
            <FieldLabel label="Color over the photo" info="More color = easier to read, less photo." />
            <input
              type="range"
              min={OVERLAY_MIN}
              max={OVERLAY_MAX}
              step={0.05}
              value={band.overlay ?? DEFAULT_OVERLAY}
              onChange={(e) => setPart("band", "overlay", Number(e.target.value))}
              aria-label="Color over the photo"
              className="w-full accent-[color:var(--ds-primary)]"
            />
          </div>
        )}
        <Problems list={at("band")} />
      </div>
    );
  }

  if (section === "shape") {
    return (
      <div className="space-y-4">
        <div>
          <FieldLabel label="Buttons" info="Outline buttons fill in when pointed at." />
          <Segmented value={spec.buttons ?? "solid"} options={BUTTON_STYLES.map((v) => ({ value: v, label: LABEL[v] }))} onChange={(v) => setTop("buttons", v === "solid" ? null : v)} label="Button style" />
        </div>
        <div>
          <FieldLabel label="Card corners" />
          <Segmented value={spec.corners ?? "round"} options={CORNER_STYLES.map((v) => ({ value: v, label: LABEL[v] }))} onChange={(v) => setTop("corners", v === "round" ? null : v)} label="Card corners" />
        </div>
        <Problems list={[...at("buttons"), ...at("corners")]} />
      </div>
    );
  }

  if (section === "background") {
    return (
      <ColorRow label="Page background" info="A light tint behind the cards. It must stay near-white so text reads easily." value={spec.colors?.ground} onChange={(v) => setPart("colors", "ground", v)} problems={at("colors.ground")} />
    );
  }

  if (section === "portal") {
    const shown = (spec.portal?.sections?.length ? spec.portal.sections : [...PORTAL_SECTIONS]).filter((s) => !PORTAL_PINNED_SECTIONS.includes(s));
    const hidden = PORTAL_SECTIONS.filter((s) => !PORTAL_PINNED_SECTIONS.includes(s) && !shown.includes(s));
    const write = (nextShown: PortalSectionId[]) => setPart("portal", "sections", [...PORTAL_PINNED_SECTIONS, ...nextShown]);
    return (
      <div className="space-y-2">
        <FieldLabel label="Order and what shows" info="Balance due and To do (with new messages) always come first and can't be hidden. Messages stays in the portal's tab bar. Drag to change the order." />
        <div className="ds-card ds-divide overflow-hidden">
          {PORTAL_PINNED_SECTIONS.map((id) => (
            <div key={id} className="ds-row" data-section={id}>
              <Lock size={15} className="shrink-0 text-[color:var(--ds-faint)]" aria-label="Always shown" />
              <span className="flex-1 text-sm text-[color:var(--ds-ink)]">{SECTION_NAME[id]}</span>
            </div>
          ))}
          <DragList
            ids={shown}
            label={(id) => SECTION_NAME[id as PortalSectionId]}
            onReorder={(ids) => write(ids as PortalSectionId[])}
            trail={(id) => <Switch checked label={`Show ${SECTION_NAME[id as PortalSectionId]}`} onChange={() => write(shown.filter((s) => s !== id))} />}
          />
          {hidden.map((id) => (
            <div key={id} className="ds-row" data-section={id}>
              <span className="w-[22px]" />
              <span className="flex-1 text-sm text-[color:var(--ds-ink-2)]">{SECTION_NAME[id]}</span>
              <Switch checked={false} label={`Show ${SECTION_NAME[id]}`} onChange={() => write([...shown, id])} />
            </div>
          ))}
        </div>
        <Problems list={at("portal.sections")} />
      </div>
    );
  }

  if (section === "login") {
    const layout = spec.login?.layout ?? "band-top";
    return (
      <div className="space-y-4">
        <div>
          <FieldLabel label="Layout" info="Photo layouts need a sign-in photo; without one the page keeps the band on top." />
          <Segmented value={layout} options={LOGIN_LAYOUTS.map((v) => ({ value: v, label: LABEL[v] }))} onChange={(v) => setPart("login", "layout", v === "band-top" ? null : v)} label="Sign-in layout" />
        </div>
        {(layout !== "band-top" || spec.login?.imageId) && (
          <PhotoSlot
            fixture={fixture}
            label="Sign-in photo"
            value={spec.login?.imageId ?? null}
            onChange={(id) => {
              onAsset(id);
              setPart("login", "imageId", id);
            }}
          />
        )}
        <CopyField label="Heading" max={COPY_LIMITS.heading} value={spec.login?.heading} onChange={(v) => setPart("login", "heading", v)} problems={at("login.heading")} />
        <Problems list={[...at("login.layout"), ...at("login.imageId")]} />
      </div>
    );
  }

  if (section === "booking") {
    const menu = items.filter((i) => i.showOnPage);
    const listed = (spec.booking?.items ?? []).filter((o) => menu.some((m) => m.id === o.id));
    const order = [...listed.map((o) => o.id), ...menu.filter((m) => !listed.some((o) => o.id === m.id)).map((m) => m.id)];
    const showOf = (id: string) => listed.find((o) => o.id === id)?.show ?? true;
    const write = (ids: string[], show: (id: string) => boolean) => setPart("booking", "items", ids.map((id) => ({ id, show: show(id) })));
    return (
      <div className="space-y-4">
        {spec.band?.imageId && (
          <div>
            <FieldLabel label="Top of the page" info="Photo layouts use the photo from Adjust it yourself → Photo." />
            <Segmented value={spec.booking?.hero ?? "plain"} options={BOOKING_HEROES.map((v) => ({ value: v, label: LABEL[v] }))} onChange={(v) => setPart("booking", "hero", v === "plain" ? null : v)} label="Booking page top" />
          </div>
        )}
        <CopyField label="Line under the heading" max={COPY_LIMITS.line} value={spec.booking?.line} onChange={(v) => setPart("booking", "line", v)} problems={at("booking.line")} />
        <CopyField
          label="Thank-you message"
          info="Shown after someone books or sends a form, when the item has no thank-you of its own."
          max={COPY_LIMITS.thankYou}
          value={spec.booking?.thankYou}
          onChange={(v) => setPart("booking", "thankYou", v)}
          problems={at("booking.thankYou")}
          multiline
        />
        {menu.length > 0 && (
          <div>
            <FieldLabel label="What's on the page" info="Drag to change the order. Hiding an item only takes it off this page: its own link keeps working." />
            <div className="ds-card ds-divide overflow-hidden">
              <DragList
                ids={order}
                label={(id) => {
                  const it = menu.find((m) => m.id === id);
                  return (
                    <span className={showOf(id) ? "" : "text-[color:var(--ds-faint)]"}>
                      {it?.name}
                      {it?.hubForm ? <span className="ds-small ml-2">Portal form</span> : null}
                    </span>
                  );
                }}
                onReorder={(ids) => write(ids, showOf)}
                trail={(id) => <Switch checked={showOf(id)} label={`Show ${menu.find((m) => m.id === id)?.name}`} onChange={(v) => write(order, (x) => (x === id ? v : showOf(x)))} />}
              />
            </div>
          </div>
        )}
        <Problems list={at("booking.items")} />
      </div>
    );
  }

  // words: each item's description + button, for display only
  return (
    <div className="space-y-5">
      {items.length === 0 && <p className="ds-small">No booking items yet.</p>}
      {items.map((it) => {
        const w = spec.itemWords?.[it.id] ?? {};
        const put = (key: "description" | "button", v: string) =>
          edit((s) => {
            const all = { ...(s.itemWords ?? {}) };
            const one = { ...(all[it.id] ?? {}) };
            if (v) one[key] = v;
            else delete one[key];
            if (Object.keys(one).length) all[it.id] = one;
            else delete all[it.id];
            if (Object.keys(all).length) s.itemWords = all;
            else delete s.itemWords;
          });
        return (
          <div key={it.id} className="space-y-2">
            <p className="text-sm font-semibold text-[color:var(--ds-ink)]">{it.name}</p>
            <CopyField label="Description" max={COPY_LIMITS.itemDescription} value={w.description} placeholder={it.description ?? ""} onChange={(v) => put("description", v)} problems={at(`itemWords.${it.id}.description`)} multiline />
            <CopyField label="Button" max={COPY_LIMITS.button} value={w.button} onChange={(v) => put("button", v)} problems={at(`itemWords.${it.id}.button`)} />
          </div>
        );
      })}
      <p className="ds-small flex items-center gap-1">
        Questions on each form <InfoTip>Questions, their order and help text are edited on each item in Booking &amp; forms.</InfoTip>
      </p>
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────

function FieldLabel({ label, info }: { label: string; info?: React.ReactNode }) {
  return (
    <span className="mb-1.5 flex items-center gap-1 text-[13px] font-medium text-[color:var(--ds-ink-2)]">
      {label}
      {info && <InfoTip>{info}</InfoTip>}
    </span>
  );
}

function Problems({ list }: { list: ThemeProblem[] }) {
  if (!list.length) return null;
  return (
    <ul className="space-y-1">
      {list.map((p, i) => (
        <li key={i} className="flex gap-1.5 text-[13px] text-[color:var(--ds-bad)]">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{p.message}</span>
        </li>
      ))}
    </ul>
  );
}

const HEX = /^#[0-9a-fA-F]{6}$/;

function ColorRow({ label, info, value, onChange, problems }: { label: string; info: string; value: string | undefined; onChange: (v: string | null) => void; problems: ThemeProblem[] }) {
  const [text, setText] = useState(value ?? "");
  useEffect(() => setText(value ?? ""), [value]);
  const fix = problems.find((p) => p.suggestion)?.suggestion;
  return (
    <div data-color-row={label}>
      <FieldLabel label={label} info={info} />
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value && HEX.test(value) ? value : "#ffffff"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          aria-label={`${label} color`}
          className="h-11 w-12 shrink-0 cursor-pointer rounded-[10px] border border-[color:var(--ds-line-strong)] bg-transparent p-1"
        />
        <Input
          value={text}
          placeholder="Your brand color"
          onChange={(e) => {
            const v = e.target.value.trim();
            setText(v);
            const hex = v.startsWith("#") ? v : `#${v}`;
            if (HEX.test(hex)) onChange(hex.toUpperCase());
            if (!v) onChange(null);
          }}
          aria-label={`${label} hex`}
          className="w-full min-w-0 font-mono uppercase placeholder:font-sans placeholder:normal-case"
        />
        {value && (
          <button type="button" className="ds-small shrink-0 underline" onClick={() => onChange(null)}>
            Default
          </button>
        )}
      </div>
      {problems.length > 0 && (
        <div className="mt-2 rounded-[10px] bg-[color:var(--ds-surface-2)] px-3 py-2">
          <Problems list={problems} />
          {fix && (
            <button type="button" onClick={() => onChange(fix)} className="mt-2 flex items-center gap-2 text-[13px] font-medium text-[color:var(--ds-primary)]" data-testid="use-suggestion">
              <span className="inline-block h-4 w-4 rounded-[4px] border border-[color:var(--ds-line-strong)]" style={{ background: fix }} />
              Use {fix}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CopyField({
  label,
  info,
  max,
  value,
  placeholder,
  onChange,
  problems,
  multiline = false,
}: {
  label: string;
  info?: string;
  max: number;
  value: string | undefined;
  placeholder?: string;
  onChange: (v: string) => void;
  problems: ThemeProblem[];
  multiline?: boolean;
}) {
  const v = value ?? "";
  const common = {
    value: v,
    placeholder: placeholder || "Leave blank for the default",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value.replace(/[\r\n]+/g, " ")),
    "aria-label": label,
    className: "w-full",
  };
  return (
    <div>
      <span className="flex items-center justify-between">
        <FieldLabel label={label} info={info} />
        <span className={`ds-small ${v.length > max ? "text-[color:var(--ds-bad)]" : ""}`}>
          {v.length}/{max}
        </span>
      </span>
      {multiline ? <Textarea rows={2} {...common} /> : <Input {...common} />}
      <div className="mt-1">
        <Problems list={problems} />
      </div>
    </div>
  );
}

function Segmented({ value, options, onChange, label }: { value: string; options: { value: string; label: string; icon?: typeof Monitor }[]; onChange: (v: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full flex-wrap gap-1 rounded-[12px] bg-[color:var(--ds-surface-2)] p-1">
      {options.map((o) => {
        const on = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[13px] font-medium transition-colors ${on ? "bg-[color:var(--ds-surface)] text-[color:var(--ds-ink)] shadow-sm" : "text-[color:var(--ds-ink-2)] hover:text-[color:var(--ds-ink)]"}`}
          >
            {Icon && <Icon size={14} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${checked ? "bg-[color:var(--ds-primary)]" : "bg-[color:var(--ds-line-strong)]"}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`} />
    </button>
  );
}

function RowLead({ icon: Icon }: { icon: typeof Eye }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[color:var(--ds-primary-soft)] text-[color:var(--ds-primary)]">
      <Icon size={17} strokeWidth={2.25} />
    </span>
  );
}

function PhotoSlot({ label, value, onChange, fixture }: { label: string; value: string | null; onChange: (id: string | null) => void; fixture: boolean }) {
  if (fixture) {
    return (
      <div>
        <FieldLabel label={label} />
        <p className="ds-small rounded-[10px] bg-[color:var(--ds-surface-2)] px-3 py-2">{value ? "Your crew photo" : "No photo yet"}</p>
      </div>
    );
  }
  return <ClientThemePhotoPicker label={label} value={value} onChange={onChange} />;
}

/**
 * A list you reorder by dragging the grip (mouse, finger or pen), or with
 * the arrow keys on a focused grip. The order changes live as the row passes
 * its neighbours.
 */
function DragList({ ids, label, onReorder, trail }: { ids: string[]; label: (id: string) => React.ReactNode; onReorder: (ids: string[]) => void; trail?: (id: string) => React.ReactNode }) {
  const [drag, setDrag] = useState<{ id: string; startY: number; dy: number; rowH: number } | null>(null);
  const rows = useRef<Record<string, HTMLDivElement | null>>({});
  const move = (from: number, to: number) => {
    const next = [...ids];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    onReorder(next);
  };
  return (
    <>
      {ids.map((id, i) => {
        const dragging = drag?.id === id;
        return (
          <div
            key={id}
            ref={(el) => {
              rows.current[id] = el;
            }}
            className={`ds-row relative bg-[color:var(--ds-surface)] ${dragging ? "z-10 shadow-lg" : ""}`}
            style={dragging ? { transform: `translateY(${drag.dy}px)` } : undefined}
            data-section={id}
          >
            <button
              type="button"
              aria-label={`Move ${typeof label(id) === "string" ? label(id) : "item"} (drag, or use the arrow keys)`}
              className="-ml-1 cursor-grab touch-none rounded p-0.5 text-[color:var(--ds-faint)] active:cursor-grabbing"
              onKeyDown={(e) => {
                if (e.key === "ArrowUp" && i > 0) {
                  e.preventDefault();
                  move(i, i - 1);
                } else if (e.key === "ArrowDown" && i < ids.length - 1) {
                  e.preventDefault();
                  move(i, i + 1);
                }
              }}
              onPointerDown={(e) => {
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                setDrag({ id, startY: e.clientY, dy: 0, rowH: rows.current[id]?.offsetHeight || 52 });
              }}
              onPointerMove={(e) => {
                if (!drag || drag.id !== id) return;
                const dy = e.clientY - drag.startY;
                const steps = Math.trunc(dy / drag.rowH);
                const to = Math.max(0, Math.min(ids.length - 1, i + steps));
                if (to !== i) {
                  move(i, to);
                  setDrag({ ...drag, startY: drag.startY + (to - i) * drag.rowH, dy: dy - (to - i) * drag.rowH });
                } else setDrag({ ...drag, dy });
              }}
              onPointerUp={() => setDrag(null)}
              onPointerCancel={() => setDrag(null)}
            >
              <GripVertical size={18} />
            </button>
            <span className="min-w-0 flex-1 text-sm text-[color:var(--ds-ink)]">{label(id)}</span>
            {trail?.(id)}
          </div>
        );
      })}
    </>
  );
}

function HistoryList({
  versions,
  publishedId,
  busy,
  onUse,
  onReset,
  hasPublished,
}: {
  versions: ThemeRowJson[];
  publishedId: string | null;
  busy: boolean;
  onUse: (v: ThemeRowJson) => void;
  onReset: () => void;
  hasPublished: boolean;
}) {
  return (
    <div className="space-y-4">
      {versions.length === 0 ? (
        <p className="ds-small">Nothing published yet. Each look you publish is kept here.</p>
      ) : (
        <div className="ds-card ds-divide overflow-hidden">
          {versions.map((v) => {
            const live = v.id === publishedId;
            return (
              <div key={v.id} className="ds-row" data-version={v.version}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-medium text-[color:var(--ds-ink)]">
                    Version {v.version}
                    {v.note ? `: ${v.note}` : ""}
                  </span>
                  <span className="ds-small block">
                    {when(v.publishedAt ?? v.createdAt)}
                    {v.source === "atlas" ? " · by Atlas" : v.source === "connector" ? " · from a connected app" : ""}
                  </span>
                </span>
                {live ? (
                  <Chip tone="good">Live</Chip>
                ) : (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => onUse(v)} className={OFF}>
                    Use this one
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <Button variant="ghost" icon={RotateCcw} disabled={busy || !hasPublished} onClick={onReset} className={OFF}>
        Reset to default
      </Button>
    </div>
  );
}

function HistoryDrawer({ children, onClose, desktop }: { children: React.ReactNode; onClose: () => void; desktop: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!desktop) {
    return (
      <BottomSheet open onClose={onClose} title="History" closeButton>
        <div className="ds max-h-[70vh] overflow-y-auto px-4 pb-6">{children}</div>
      </BottomSheet>
    );
  }
  return (
    <div className="ds fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="History">
      <button type="button" aria-label="Close history" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="ds-glass-strong absolute inset-y-0 right-0 w-[420px] max-w-full overflow-y-auto bg-[color:var(--ds-surface)]/95 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="ds-h2">History</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-[color:var(--ds-ink-2)]">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Phone: the four pages full screen, swiped sideways (or picked from the tabs). */
function PhonePreview({ onClose, srcOf, reloadKey }: { onClose: () => void; srcOf: (s: Surface) => string; reloadKey: number }) {
  const [at, setAt] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const go = (i: number) => {
    setAt(i);
    strip.current?.scrollTo({ left: i * (strip.current?.clientWidth ?? 0), behavior: "smooth" });
  };
  return (
    <div className="ds fixed inset-0 z-[70] flex flex-col bg-[color:var(--ds-surface)]" role="dialog" aria-modal="true" aria-label="Preview">
      <div className="flex items-center gap-2 px-3 pb-2 pt-[calc(env(safe-area-inset-top)+8px)]">
        <button type="button" onClick={onClose} aria-label="Close preview" className="rounded-full p-2 text-[color:var(--ds-ink)]">
          <X size={20} />
        </button>
        <div className="flex flex-1 justify-center">
          <Segmented value={SURFACES[at].key} options={SURFACES.map((s) => ({ value: s.key, label: s.label }))} onChange={(v) => go(SURFACES.findIndex((s) => s.key === v))} label="Page to preview" />
        </div>
      </div>
      <div
        ref={strip}
        className="flex flex-1 snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          if (i !== at) setAt(i);
        }}
      >
        {SURFACES.map((s, i) => (
          <div key={s.key} className="h-full w-full shrink-0 snap-center px-2 pb-2">
            {Math.abs(i - at) <= 1 && <iframe key={reloadKey} src={srcOf(s.key)} title={`Preview: ${s.label}`} className="h-full w-full rounded-[12px] border border-[color:var(--ds-line)] bg-white" />}
          </div>
        ))}
      </div>
    </div>
  );
}
