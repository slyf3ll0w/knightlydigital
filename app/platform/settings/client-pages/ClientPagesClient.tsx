"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronRight, Eye, GripVertical, History, Lock, Monitor, RotateCcw, Smartphone, Sparkles, X } from "lucide-react";
import { Button, Card, Chip, DsPage, InfoTip, PageHeader } from "@/components/ds";
import { Input, Select, Textarea } from "@/components/Input";
import BottomSheet from "@/components/BottomSheet";
import { confirmSheet } from "@/components/ConfirmSheet";
import { useAssistant } from "@/components/AssistantContext";
import ClientThemePhotoPicker from "@/components/ClientThemePhotoPicker";
import {
  BAND_STYLES,
  BOOKING_HEROES,
  BUTTON_STYLES,
  COPY_LIMITS,
  CORNER_STYLES,
  LOGIN_LAYOUTS,
  LOGO_PLACEMENTS,
  LOGO_SIZES,
  OVERLAY_MAX,
  OVERLAY_MIN,
  DEFAULT_OVERLAY,
  PORTAL_PINNED_SECTIONS,
  PORTAL_SECTIONS,
  THEME_FONTS,
  parseClientTheme,
  type ClientThemeSpec,
  type PortalSectionId,
  type ThemeContext,
  type ThemeProblem,
} from "@/lib/client-theme-spec";
import type { ThemeRowJson, ThemeStateJson } from "@/lib/client-theme-store";
import type { ThemeBookingItem } from "@/lib/client-theme-route";

/**
 * Settings → Client pages (the AI page designer, Pro). One local spec is the
 * source of truth: every edit is checked here with the same parseClientTheme
 * the server runs (instant contrast fixes), then autosaved as the company's
 * draft (PUT /api/app/client-theme/draft, replace) and the preview reloads.
 * Clients never see a draft; Publish / History / Reset go through
 * POST /api/app/client-theme/publish — the same route Atlas's cards call.
 *
 * Desktop: controls left, live preview right (surface switcher, phone /
 * desktop width). Phone (iOS-style): one list of rows, each a sheet; a
 * full-screen preview you swipe between surfaces; Publish at the foot.
 */

type Spec = ClientThemeSpec & Record<string, unknown>;
type SectionKey = "colors" | "font" | "logo" | "style" | "portal" | "login" | "booking" | "words";
type Surface = "portal" | "login" | "booking" | "form";

/** The kit button has no disabled look of its own. */
const OFF = "disabled:cursor-not-allowed disabled:opacity-45";

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "colors", label: "Colors" },
  { key: "font", label: "Font" },
  { key: "logo", label: "Logo & photos" },
  { key: "style", label: "Style" },
  { key: "portal", label: "Portal home" },
  { key: "login", label: "Sign-in page" },
  { key: "booking", label: "Booking page" },
  { key: "words", label: "Words" },
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

/** Which control section a problem belongs on. */
function sectionOf(path: string): SectionKey {
  const top = path.split(/[.[]/)[0];
  if (top === "colors") return "colors";
  if (top === "font") return "font";
  if (top === "logo" || top === "band") return "logo";
  if (top === "buttons" || top === "corners") return "style";
  if (top === "portal") return "portal";
  if (top === "login") return "login";
  if (top === "booking") return "booking";
  if (top === "itemWords") return "words";
  return "colors";
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

export default function ClientPagesClient({
  initial,
  items,
  ctx: initialCtx,
  companyName,
  slug,
  fixture = false,
}: {
  initial: ThemeStateJson;
  /** Active booking items (id, name, slug, description, showOnPage, hubForm). */
  items: Pick<ThemeBookingItem, "id" | "name" | "slug" | "description" | "showOnPage" | "hubForm">[];
  ctx: ThemeContext;
  companyName: string;
  slug: string;
  /** Review gallery only: no saving, previews render the spec on the fake Brightwire account. */
  fixture?: boolean;
}) {
  const atlas = useAssistant();
  const [published, setPublished] = useState<ThemeRowJson | null>(initial.published);
  const [draft, setDraft] = useState<ThemeRowJson | null>(initial.draft);
  const [versions, setVersions] = useState<ThemeRowJson[]>(initial.versions);
  const [spec, setSpec] = useState<Spec>(() => clone((initial.draft?.spec ?? initial.published?.spec ?? { v: 1 }) as Spec));
  const [assetIds, setAssetIds] = useState<string[]>([...initialCtx.assetIds]);
  const ctx = useMemo<ThemeContext>(() => ({ ...initialCtx, assetIds }), [initialCtx, assetIds]);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [surface, setSurface] = useState<Surface>("portal");
  const [device, setDevice] = useState<"phone" | "desktop">("phone");
  const [formSlug, setFormSlug] = useState<string>(() => (items.find((i) => i.showOnPage) ?? items[0])?.slug ?? "");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sheet, setSheet] = useState<SectionKey | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  const edited = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setIsDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const parsed = useMemo(() => parseClientTheme(spec, ctx), [spec, ctx]);
  const problems = parsed.problems;
  const problemsBy = useMemo(() => {
    const m: Partial<Record<SectionKey, ThemeProblem[]>> = {};
    for (const p of problems) (m[sectionOf(p.path)] ??= []).push(p);
    return m;
  }, [problems]);
  const changed = canon(spec, ctx) !== canon(published?.spec, ctx);
  const canPublish = changed && problems.length === 0 && status !== "saving" && !busy && !fixture;

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
  }, []);

  // No draft yet (first visit, or just published elsewhere): make one so the preview has a link
  useEffect(() => {
    if (fixture || initial.draft) return;
    void reload(true).catch((e) => setError((e as Error).message));
  }, [fixture, initial.draft, reload]);

  // Autosave: every edit becomes the draft (clients never see it)
  useEffect(() => {
    if (!edited.current || fixture) return;
    setStatus("saving");
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/app/client-theme/draft", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spec: prune(spec), replace: true }),
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
    }, 700);
    return () => window.clearTimeout(t);
  }, [spec, fixture]);

  // The fixture gallery has no saving: the preview follows the spec itself
  useEffect(() => {
    if (!fixture) return;
    const t = window.setTimeout(() => setPreviewKey((k) => k + 1), 400);
    return () => window.clearTimeout(t);
  }, [spec, fixture]);

  function edit(fn: (s: Spec) => void) {
    edited.current = true;
    setSpec((prev) => {
      const next = clone(prev);
      fn(next);
      return next;
    });
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
      const res = await fetch("/api/app/client-theme/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft: true }) });
      if (!res.ok) throw new Error(await errorText(res));
      await reload(true);
    });
  }

  async function discard() {
    const ok = await confirmSheet({ title: "Discard your changes?", message: "The draft goes back to the look your clients see now.", confirmLabel: "Discard changes", destructive: true });
    if (!ok) return;
    await run(async () => {
      const res = await fetch("/api/app/client-theme/draft", { method: "DELETE" });
      if (!res.ok) throw new Error(await errorText(res));
      await reload(true);
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

  function askAtlas() {
    atlas.open(`Design my client pages (sign-in, portal, booking page and forms) to look like `);
  }

  const statusText = fixture
    ? "Preview only"
    : status === "saving"
      ? "Saving…"
      : status === "error"
        ? "Not saved"
        : changed
          ? "Draft saved"
          : published
            ? "Same as what's live"
            : "Default look";

  const sectionBody = (key: SectionKey) => (
    <SectionBody
      section={key}
      spec={spec}
      problems={problemsBy[key] ?? []}
      items={items}
      setPart={setPart}
      setTop={setTop}
      edit={edit}
      onAsset={(id) => id && setAssetIds((a) => (a.includes(id) ? a : [...a, id]))}
      fixture={fixture}
    />
  );

  const history = (
    <HistoryList versions={versions} publishedId={published?.id ?? null} busy={busy || fixture} onUse={useVersion} onReset={resetDefault} hasPublished={Boolean(published)} />
  );

  const atlasButton = atlas.available ? (
    <Button variant="soft" icon={Sparkles} onClick={askAtlas}>
      Ask {atlas.name} to design it
    </Button>
  ) : null;

  return (
    <DsPage className="lg:max-w-[1400px]" >
      <div data-client-pages>
        <PageHeader
          eyebrow="Settings"
          title="Client pages"
          info={
            <>
              How your sign-in page, client portal, booking page and forms look. Changes save as a draft only you can see; Publish puts
              them live. Quotes, invoices and emails keep your brand colors from Settings → Branding. Form questions are edited in Booking &amp; forms.
            </>
          }
          actions={
            <span className="hidden items-center gap-2 lg:flex">
              {atlasButton}
              <Button variant="outline" icon={History} onClick={() => setHistoryOpen(true)}>
                History
              </Button>
            </span>
          }
        />
        {error && (
          <p role="alert" className="mt-4 rounded-[12px] bg-[color:var(--ds-bad-soft,#FEE2E2)] px-4 py-2.5 text-sm text-[color:var(--ds-bad)]">
            {error}
          </p>
        )}

        {/* ── Desktop: controls left, live preview right ── */}
        <div className="mt-6 hidden gap-6 lg:grid lg:grid-cols-[400px_minmax(0,1fr)]">
          <div className="space-y-4 pb-6">
            {SECTIONS.map((s) => (
              <Card key={s.key} className="p-5" data-testid={`theme-section-${s.key}`}>
                <h2 className="ds-h2 mb-3 flex items-center gap-2">
                  {s.label}
                  {problemsBy[s.key]?.length ? <Chip tone="bad">Needs a fix</Chip> : null}
                </h2>
                {sectionBody(s.key)}
              </Card>
            ))}
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
                    { value: "phone", label: "Phone", icon: Smartphone },
                    { value: "desktop", label: "Desktop", icon: Monitor },
                  ]}
                  onChange={(v) => setDevice(v as "phone" | "desktop")}
                  label="Preview width"
                />
              </span>
            </div>
            <div className="ds-card flex justify-center overflow-hidden bg-[color:var(--ds-surface-2)] p-3">
              {isDesktop && (
                <iframe
                  key={`${surface}-${formSlug}-${previewKey}`}
                  src={previewSrc(surface)}
                  title={`Preview: ${SURFACES.find((s) => s.key === surface)?.label}`}
                  className="h-[calc(100vh-230px)] min-h-[560px] rounded-[10px] border-0 bg-white"
                  style={{ width: device === "phone" ? 390 : "100%", maxWidth: "100%" }}
                />
              )}
            </div>
          </aside>
        </div>

        {/* Desktop bottom bar: sticks to the foot of the page column (never over the nav rail);
            the right padding keeps Publish clear of the floating Atlas buttons. */}
        <div className="sticky bottom-0 z-30 -mx-8 hidden border-t border-[color:var(--ds-line)] bg-[color:var(--ds-surface)]/95 backdrop-blur lg:block">
          <div className="flex items-center justify-end gap-3 py-3 pl-8 pr-[168px]">
            <span className="mr-auto flex items-center gap-2 text-sm text-[color:var(--ds-ink-2)]" data-testid="theme-status">
              {statusText}
              {problems.length > 0 && (
                <Chip tone="bad" icon={AlertTriangle}>
                  {problems.length === 1 ? "1 thing to fix before publishing" : `${problems.length} things to fix before publishing`}
                </Chip>
              )}
            </span>
            <Button variant="ghost" onClick={discard} disabled={!changed || busy || fixture} className={OFF}>
              Discard
            </Button>
            <Button onClick={publish} disabled={!canPublish} loading={busy} data-testid="theme-publish" className={OFF}>
              Publish
            </Button>
          </div>
        </div>

        {/* ── Phone: one list of rows, each a sheet ── */}
        <div className="mt-5 space-y-4 pb-36 lg:hidden">
          {atlasButton && <div className="[&>*]:w-full">{atlasButton}</div>}
          <Card className="ds-divide overflow-hidden">
            <button type="button" className="ds-row w-full text-left" onClick={() => setPreviewOpen(true)}>
              <RowLead icon={Eye} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium text-[color:var(--ds-ink)]">Preview</span>
                <span className="ds-small block">{statusText}</span>
              </span>
              <ChevronRight size={16} className="text-[color:var(--ds-faint)]" />
            </button>
          </Card>
          <Card className="ds-divide overflow-hidden">
            {SECTIONS.map((s) => (
              <button key={s.key} type="button" className="ds-row w-full text-left" onClick={() => setSheet(s.key)} data-testid={`theme-row-${s.key}`}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-[color:var(--ds-ink)]">{s.label}</span>
                  <span className="ds-small block truncate">{summaryOf(s.key, spec, items)}</span>
                </span>
                {problemsBy[s.key]?.length ? <Chip tone="bad">Fix</Chip> : null}
                <ChevronRight size={16} className="text-[color:var(--ds-faint)]" />
              </button>
            ))}
          </Card>
          <Card className="ds-divide overflow-hidden">
            <button type="button" className="ds-row w-full text-left" onClick={() => setHistoryOpen(true)}>
              <RowLead icon={History} />
              <span className="min-w-0 flex-1 text-[15px] font-medium text-[color:var(--ds-ink)]">History</span>
              <ChevronRight size={16} className="text-[color:var(--ds-faint)]" />
            </button>
            {changed && !fixture && (
              <button type="button" className="ds-row w-full text-left" onClick={discard} disabled={busy}>
                <RowLead icon={RotateCcw} />
                <span className="min-w-0 flex-1 text-[15px] font-medium text-[color:var(--ds-ink)]">Discard changes</span>
              </button>
            )}
          </Card>
        </div>
        <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 border-t border-[color:var(--ds-line)] bg-[color:var(--ds-surface)]/95 px-4 py-3 backdrop-blur lg:hidden">
          {problems.length > 0 && <p className="mb-2 text-center text-[13px] text-[color:var(--ds-bad)]">Fix the marked {problems.length === 1 ? "row" : "rows"} to publish</p>}
          <Button className={`w-full ${OFF}`} onClick={publish} disabled={!canPublish} loading={busy} data-testid="theme-publish-phone">
            {changed ? "Publish" : "Nothing new to publish"}
          </Button>
        </div>

        {SECTIONS.map((s) => (
          <BottomSheet key={s.key} open={sheet === s.key} onClose={() => setSheet(null)} title={s.label} closeButton>
            <div className="ds max-h-[70vh] overflow-y-auto px-4 pb-6">{sectionBody(s.key)}</div>
          </BottomSheet>
        ))}

        {isDesktop === false && previewOpen && (
          <PhonePreview onClose={() => setPreviewOpen(false)} srcOf={previewSrc} reloadKey={previewKey} />
        )}

        {historyOpen && (
          <HistoryDrawer onClose={() => setHistoryOpen(false)} desktop={Boolean(isDesktop)}>
            {history}
          </HistoryDrawer>
        )}
        <span className="sr-only">{companyName}</span>
      </div>
    </DsPage>
  );
}

// ── Sections ────────────────────────────────────────────────────────────

function SectionBody({
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
  section: SectionKey;
  spec: Spec;
  problems: ThemeProblem[];
  items: { id: string; name: string; description: string | null; showOnPage: boolean; hubForm: boolean }[];
  setPart: (group: string, key: string, value: unknown) => void;
  setTop: (key: string, value: unknown) => void;
  edit: (fn: (s: Spec) => void) => void;
  onAsset: (id: string | null) => void;
  fixture: boolean;
}) {
  const at = (prefix: string) => problems.filter((p) => p.path === prefix || p.path.startsWith(`${prefix}.`) || p.path.startsWith(`${prefix}[`));
  const other = (used: string[]) => problems.filter((p) => !used.some((u) => p.path === u || p.path.startsWith(`${u}.`) || p.path.startsWith(`${u}[`)));

  if (section === "colors") {
    const c = spec.colors ?? {};
    return (
      <div className="space-y-4">
        <ColorRow label="Band" info="The strip across the top with your logo. Text on it is picked white or dark to stay readable." value={c.band} onChange={(v) => setPart("colors", "band", v)} problems={at("colors.band")} />
        <ColorRow label="Buttons" info="Buttons, links and selected choices. Must stand out on white." value={c.accent} onChange={(v) => setPart("colors", "accent", v)} problems={at("colors.accent")} />
        <ColorRow label="Page background" info="A light tint behind the cards. It must stay near-white so text reads easily." value={c.ground} onChange={(v) => setPart("colors", "ground", v)} problems={at("colors.ground")} />
        <Problems list={other(["colors.band", "colors.accent", "colors.ground"])} />
      </div>
    );
  }

  if (section === "font") {
    return (
      <div className="space-y-2">
        <FieldLabel label="Display font" info="Headings, the band title and buttons. Body text and amounts stay as they are." />
        <Select className="w-full" value={(spec.font as string) ?? ""} onChange={(e) => setTop("font", e.target.value)} aria-label="Display font">
          <option value="">Default</option>
          {THEME_FONTS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </Select>
        <Problems list={problems} />
      </div>
    );
  }

  if (section === "logo") {
    const band = spec.band ?? {};
    const style = band.style ?? "solid";
    return (
      <div className="space-y-4">
        <div>
          <FieldLabel label="Logo size" />
          <Segmented value={spec.logo?.size ?? "md"} options={LOGO_SIZES.map((v) => ({ value: v, label: LABEL[v] }))} onChange={(v) => setPart("logo", "size", v === "md" ? null : v)} label="Logo size" />
        </div>
        <div>
          <FieldLabel label="Logo placement" />
          <Segmented value={spec.logo?.placement ?? "band-left"} options={LOGO_PLACEMENTS.map((v) => ({ value: v, label: LABEL[v] }))} onChange={(v) => setPart("logo", "placement", v === "band-left" ? null : v)} label="Logo placement" />
        </div>
        <div>
          <FieldLabel label="Band style" info="Photo puts one of your photos behind the band, under a layer of the band color so the text stays readable." />
          <Segmented value={style} options={BAND_STYLES.map((v) => ({ value: v, label: LABEL[v] }))} onChange={(v) => setPart("band", "style", v === "solid" ? null : v)} label="Band style" />
        </div>
        {(style === "photo" || band.imageId) && (
          <>
            <PhotoSlot fixture={fixture} label="Band photo" value={band.imageId ?? null} onChange={(id) => { onAsset(id); setPart("band", "imageId", id); }} />
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
          </>
        )}
        <Problems list={problems} />
      </div>
    );
  }

  if (section === "style") {
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
        <Problems list={problems} />
      </div>
    );
  }

  if (section === "portal") {
    const shown = (spec.portal?.sections?.length ? spec.portal.sections : [...PORTAL_SECTIONS]).filter((s) => !PORTAL_PINNED_SECTIONS.includes(s));
    const hidden = PORTAL_SECTIONS.filter((s) => !PORTAL_PINNED_SECTIONS.includes(s) && !shown.includes(s));
    const write = (nextShown: PortalSectionId[]) => setPart("portal", "sections", [...PORTAL_PINNED_SECTIONS, ...nextShown]);
    return (
      <div className="space-y-4">
        <CopyField label="Welcome line" max={COPY_LIMITS.welcome} value={spec.portal?.welcome} onChange={(v) => setPart("portal", "welcome", v)} problems={at("portal.welcome")} />
        <div>
          <FieldLabel label="Sections" info="Balance due and To do (with new messages) always come first and can't be hidden. Messages stays in the portal's tab bar." />
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
        </div>
        <Problems list={other(["portal.welcome"])} />
      </div>
    );
  }

  if (section === "login") {
    const layout = spec.login?.layout ?? "band-top";
    return (
      <div className="space-y-4">
        <div>
          <FieldLabel label="Layout" info="Photo layouts need a photo; without one the page keeps the band on top." />
          <Segmented value={layout} options={LOGIN_LAYOUTS.map((v) => ({ value: v, label: LABEL[v] }))} onChange={(v) => setPart("login", "layout", v === "band-top" ? null : v)} label="Sign-in layout" />
        </div>
        {(layout !== "band-top" || spec.login?.imageId) && (
          <PhotoSlot fixture={fixture} label="Sign-in photo" value={spec.login?.imageId ?? null} onChange={(id) => { onAsset(id); setPart("login", "imageId", id); }} />
        )}
        <CopyField label="Heading" max={COPY_LIMITS.heading} value={spec.login?.heading} onChange={(v) => setPart("login", "heading", v)} problems={at("login.heading")} />
        <Problems list={other(["login.heading"])} />
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
        <div>
          <FieldLabel label="Top of the page" info="Photo layouts use the band photo from Logo & photos." />
          <Segmented value={spec.booking?.hero ?? "plain"} options={BOOKING_HEROES.map((v) => ({ value: v, label: LABEL[v] }))} onChange={(v) => setPart("booking", "hero", v === "plain" ? null : v)} label="Booking page top" />
        </div>
        <CopyField label="Heading" max={COPY_LIMITS.heading} value={spec.booking?.heading} onChange={(v) => setPart("booking", "heading", v)} problems={at("booking.heading")} />
        <CopyField label="Line under it" max={COPY_LIMITS.line} value={spec.booking?.line} onChange={(v) => setPart("booking", "line", v)} problems={at("booking.line")} />
        <CopyField label="Thank-you message" info="Shown after someone books or sends a form, when the item has no thank-you of its own." max={COPY_LIMITS.thankYou} value={spec.booking?.thankYou} onChange={(v) => setPart("booking", "thankYou", v)} problems={at("booking.thankYou")} multiline />
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
        <Problems list={other(["booking.heading", "booking.line", "booking.thankYou"])} />
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

function summaryOf(key: SectionKey, spec: Spec, items: { id: string; showOnPage: boolean }[]): string {
  switch (key) {
    case "colors": {
      const c = spec.colors ?? {};
      const n = [c.band, c.accent, c.ground].filter(Boolean).length;
      return n ? [c.band, c.accent, c.ground].filter(Boolean).join(" · ") : "Same as your brand colors";
    }
    case "font":
      return (spec.font as string) || "Default";
    case "logo":
      return `${LABEL[spec.logo?.size ?? "md"]} logo · ${LABEL[spec.band?.style ?? "solid"]} band`;
    case "style":
      return `${LABEL[spec.buttons ?? "solid"]} buttons · ${LABEL[spec.corners ?? "round"]} corners`;
    case "portal": {
      const n = spec.portal?.sections?.length ?? PORTAL_SECTIONS.length;
      return `${n} of ${PORTAL_SECTIONS.length} sections shown`;
    }
    case "login":
      return LABEL[spec.login?.layout ?? "band-top"];
    case "booking": {
      const hidden = (spec.booking?.items ?? []).filter((i) => !i.show && items.some((m) => m.id === i.id && m.showOnPage)).length;
      return `${LABEL[spec.booking?.hero ?? "plain"]}${hidden ? ` · ${hidden} hidden` : ""}`;
    }
    case "words": {
      const n = Object.keys(spec.itemWords ?? {}).length;
      return n ? `${n} ${n === 1 ? "item" : "items"} reworded` : "Each item's own words";
    }
  }
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
          className="h-10 w-12 shrink-0 cursor-pointer rounded-[10px] border border-[color:var(--ds-line-strong)] bg-transparent p-1"
        />
        <Input
          value={text}
          placeholder="Same as your brand color"
          onChange={(e) => {
            const v = e.target.value.trim();
            setText(v);
            const hex = v.startsWith("#") ? v : `#${v}`;
            if (HEX.test(hex)) onChange(hex.toUpperCase());
            if (!v) onChange(null);
          }}
          aria-label={`${label} hex`}
          className="w-full font-mono uppercase placeholder:font-sans placeholder:normal-case"
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
        <p className="ds-small rounded-[10px] bg-[color:var(--ds-surface-2)] px-3 py-2">{value ? `Photo ${value}` : "No photo yet"}</p>
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
