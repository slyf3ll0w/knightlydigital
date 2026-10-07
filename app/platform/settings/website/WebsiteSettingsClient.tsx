"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Globe, ImagePlus, Loader2, Plus, Send, Trash2, X } from "lucide-react";
import BackLink from "@/components/BackLink";
import PageTitle from "@/components/PageTitle";
import { Chip, InfoTip } from "@/components/ds";
import { Input, Textarea, Select, inputCls } from "@/components/Input";
import { confirmSheet } from "@/components/ConfirmSheet";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { resizePhotoFile } from "@/lib/resize-image";
import { TONE_WORDS, SOCIAL_KEYS, briefGaps, type WebsiteBrief } from "@/lib/website-brief";
import { WEBSITE_STATUS_LABEL } from "@/lib/website-shared";
import type { WebsiteSummary } from "@/lib/website";

type Photo = WebsiteSummary["photos"][number];

// Labels come from lib/website-shared.ts — one set of words for the owner.
const STATUS: Record<WebsiteSummary["status"], { tone: "neutral" | "primary" | "secondary" | "good" | "warn"; next: string }> = {
  NOT_STARTED: {
    tone: "neutral",
    next: "Fill in what you have — every field is optional — and send it to the studio. We build from your trade and what WorkBench already knows, and fill the rest.",
  },
  BRIEF_SUBMITTED: {
    tone: "primary",
    next: "We read the brief, study your trade and your area, and come back with three directions to pick from.",
  },
  IN_STUDIO: {
    tone: "primary",
    next: "Your site is being built. You can keep editing the brief and adding photos — the build reads them.",
  },
  REVIEW: {
    tone: "secondary",
    next: "Open the preview on your phone and your computer, and send us anything you want changed.",
  },
  LIVE: {
    tone: "good",
    next: "Hours, services, phone and flagged photos update the site on their own. Edit them here as usual.",
  },
};

const SOCIAL_LABEL: Record<(typeof SOCIAL_KEYS)[number], string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  yelp: "Yelp",
  nextdoor: "Nextdoor",
  youtube: "YouTube",
  tiktok: "TikTok",
};

const PHOTO_KINDS: { value: string; label: string }[] = [
  { value: "truck", label: "Truck / van" },
  { value: "team", label: "Team" },
  { value: "shop", label: "Shop / office" },
  { value: "work", label: "Our work" },
  { value: "other", label: "Other" },
];

const smallLabel = "ds-label mb-1 block";
const chipCls = (active: boolean) =>
  `rounded-[9px] px-3 py-1.5 text-xs transition-all ${active ? "chip-pressed font-semibold" : "btn-tool-line bg-white font-medium text-gray-600 hover:text-gray-900"}`;

export default function WebsiteSettingsClient({ initial }: { initial: WebsiteSummary }) {
  const router = useRouter();
  const [brief, setBrief] = useState<WebsiteBrief>(initial.brief);
  const [photos, setPhotos] = useState<Photo[]>(initial.photos);
  const [status, setStatus] = useState(initial.status);
  const [submittedAt, setSubmittedAt] = useState(initial.briefSubmittedAt);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The brief an autosave is still waiting to send, or null once it has gone
  // out. Leaving the page (Back, a tab close, the phone app going away)
  // flushes it instead of dropping it (audit 2026-10-06, F8).
  const pending = useRef<WebsiteBrief | null>(null);

  // Autosave: 900 ms after the last keystroke, one PATCH with the whole brief.
  useEffect(() => {
    if (!dirty.current) return;
    if (timer.current) clearTimeout(timer.current);
    pending.current = brief;
    setSaveState("saving");
    timer.current = setTimeout(async () => {
      pending.current = null;
      const { ok, data } = await postJson<{ brief: WebsiteBrief }>("/api/app/website", { brief }, "PATCH");
      if (!ok) {
        setSaveState("error");
        setError(data?.error ?? GENERIC_ERROR);
        return;
      }
      setSaveState("saved");
    }, 900);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [brief]);

  // Flush: send whatever is still waiting, fire-and-forget. `keepalive` lets
  // the request outlive the page; the body is a small JSON brief, well under
  // the 64 KB keepalive budget.
  useEffect(() => {
    const flush = () => {
      const b = pending.current;
      if (!b) return;
      pending.current = null;
      if (timer.current) clearTimeout(timer.current);
      try {
        void fetch("/api/app/website", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brief: b }),
          keepalive: true,
        });
      } catch {
        /* nothing left to do on the way out */
      }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  function set<K extends keyof WebsiteBrief>(key: K, value: WebsiteBrief[K]) {
    dirty.current = true;
    setError("");
    setBrief((b) => ({ ...b, [key]: value }));
  }

  async function send() {
    setError("");
    if (
      !(await confirmSheet({
        title: "Send your brief to the studio?",
        message: "We build from what you've given us and fill in the rest, then come back with three directions for your site. You can keep editing the brief afterwards.",
        confirmLabel: "Send to the studio",
      }))
    )
      return;
    setSending(true);
    try {
      // Flush any pending autosave first so the studio reads what's on screen
      if (dirty.current) {
        pending.current = null;
        await postJson("/api/app/website", { brief }, "PATCH");
      }
      const { ok, data } = await postJson<{ status: WebsiteSummary["status"]; briefSubmittedAt: string }>("/api/app/website", { action: "submit" });
      if (!ok || !data) {
        setError(data?.error ?? GENERIC_ERROR);
        return;
      }
      setStatus(data.status);
      setSubmittedAt(data.briefSubmittedAt);
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  const st = STATUS[status];
  // From the live brief and photo list, so a row ticks off as you fill it in
  // (audit 2026-10-06, F8). Company facts are edited elsewhere, so those
  // stay as loaded.
  const briefGapList = briefGaps(brief, photos.length);
  const gaps = [...initial.companyGaps, ...briefGapList];

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <BackLink href="/app/settings" />
        <PageTitle info="A website built for your business by the WorkBench studio: your own look, your own words, your real photos. The site reads your hours, services, phone and booking forms from WorkBench, so they never go out of date.">
          Website
        </PageTitle>
      </div>
      <p className="text-sm mb-6 lg:ml-8 flex items-center gap-3">
        <span className="text-[color:var(--ds-muted)]">
          {saveState === "saving" && (
            <span className="inline-flex items-center gap-1">
              <Loader2 size={12} className="animate-spin" /> Saving…
            </span>
          )}
          {saveState === "saved" && (
            <span className="inline-flex items-center gap-1">
              <Check size={12} /> Saved
            </span>
          )}
        </span>
      </p>

      {error && (
        <div role="alert" className="form-error mb-4">
          {error}
        </div>
      )}

      {/* Status */}
      <div className="ds-card p-5 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="ds-h2">Your site</h2>
            <Chip tone={st.tone} icon={Globe}>
              {WEBSITE_STATUS_LABEL[status]}
            </Chip>
          </div>
          {status === "NOT_STARTED" ? (
            <button type="button" onClick={() => void send()} disabled={sending} className="ds-btn ds-btn-primary ds-btn-sm disabled:opacity-50">
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Send to the studio
            </button>
          ) : submittedAt ? (
            <span className="text-xs text-[color:var(--ds-muted)]">Sent {new Date(submittedAt).toLocaleDateString()}</span>
          ) : null}
        </div>
        <p className="mt-2 text-sm text-[color:var(--ds-ink-2)]">{st.next}</p>
        {(initial.previewUrl || initial.domain) && (
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            {initial.domain && (
              <a href={`https://${initial.domain}`} target="_blank" rel="noreferrer" className="ds-link inline-flex items-center gap-1 hover:underline">
                {initial.domain} <ExternalLink size={12} />
              </a>
            )}
            {initial.previewUrl && (
              <a href={initial.previewUrl} target="_blank" rel="noreferrer" className="ds-link inline-flex items-center gap-1 hover:underline">
                Preview <ExternalLink size={12} />
              </a>
            )}
          </div>
        )}
        {gaps.length > 0 && status === "NOT_STARTED" && (
          <div className="mt-4 rounded-[12px] border border-[color:var(--ds-line)] p-3">
            <p className="text-xs font-semibold text-[color:var(--ds-ink-2)] mb-1.5">Makes the site more yours (all optional)</p>
            <ul className="space-y-1 text-sm">
              {initial.companyGaps.map((g) => (
                <li key={g.key} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--ds-faint)]" />
                  <Link href="/app/settings?s=company" className="ds-link hover:underline">
                    {g.label}
                  </Link>
                  <span className="text-xs text-[color:var(--ds-muted)]">Business info</span>
                </li>
              ))}
              {briefGapList.map((g) => (
                <li key={g.key} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--ds-faint)]" />
                  {g.label}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* About the business */}
      <section className="ds-card p-5 mb-6">
        <h2 className="ds-h2 flex items-center gap-1.5 mb-4">
          About your business
          <InfoTip>
            Write the way you talk to a customer at the door. The studio uses your words, not stock copy — a site that sounds like you is the whole point.
          </InfoTip>
        </h2>
        <div className="space-y-4">
          <div>
            <label className={smallLabel}>One line under your name</label>
            <Input value={brief.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="Honest heating and air for North Dallas since 2009" maxLength={120} className="w-full" />
          </div>
          <div>
            <label className={smallLabel}>Your story, in your own words</label>
            <Textarea
              value={brief.story}
              onChange={(e) => set("story", e.target.value)}
              rows={6}
              maxLength={3000}
              className="w-full"
              placeholder="How you started, who's on the crew, what you refuse to do, what customers say about you. Rough notes are fine — we'll shape them."
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={smallLabel}>Year you started</label>
              <Input
                type="number"
                inputMode="numeric"
                value={brief.foundedYear ?? ""}
                onChange={(e) => set("foundedYear", e.target.value ? Number(e.target.value) : null)}
                placeholder="2009"
                className="w-full"
              />
            </div>
            <div>
              <label className={smallLabel}>Guarantee or warranty</label>
              <Input value={brief.guarantee} onChange={(e) => set("guarantee", e.target.value)} placeholder="1-year labor warranty on every repair" maxLength={400} className="w-full" />
            </div>
          </div>
          <ChipList label="Licenses and certifications" help="Exactly as they appear on your paperwork." values={brief.licenses} onChange={(v) => set("licenses", v)} placeholder="TACLA 12345C" />
          <ChipList label="Brands you install or are certified on" values={brief.brands} onChange={(v) => set("brands", v)} placeholder="Carrier" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Toggle label="Insured" value={brief.insured} onChange={(v) => set("insured", v)} />
            <Toggle label="24/7 emergency service" value={brief.emergency} onChange={(v) => set("emergency", v)} />
          </div>
          <div>
            <label className={smallLabel}>Financing</label>
            <Input value={brief.financing} onChange={(e) => set("financing", e.target.value)} placeholder="Financing available through Synchrony" maxLength={200} className="w-full" />
          </div>
        </div>
      </section>

      {/* Where + why */}
      <section className="ds-card p-5 mb-6">
        <h2 className="ds-h2 flex items-center gap-1.5 mb-4">
          Where you work and why people pick you
          <InfoTip>Each city gets its own page on the site, so list only places you actually serve. &ldquo;What sets you apart&rdquo; becomes the site&apos;s main promises — be specific.</InfoTip>
        </h2>
        <div className="space-y-4">
          <ChipList label="Cities and areas you serve" values={brief.serviceAreas} onChange={(v) => set("serviceAreas", v)} placeholder="Allen, TX" max={20} />
          <Lines label="What sets you apart (up to 5)" values={brief.differentiators} onChange={(v) => set("differentiators", v)} max={5} placeholder="Same-day service, or the visit is free" />
        </div>
      </section>

      {/* The look */}
      <section className="ds-card p-5 mb-6">
        <h2 className="ds-h2 flex items-center gap-1.5 mb-4">
          How it should feel
          <InfoTip>These steer the three directions we show you. Pick up to five tone words; the sites you like can be in any trade.</InfoTip>
        </h2>
        <div className="space-y-4">
          <div>
            <label className={smallLabel}>Tone</label>
            <div className="flex flex-wrap gap-1.5">
              {TONE_WORDS.map((t) => {
                const on = brief.tone.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    className={chipCls(on)}
                    onClick={() => set("tone", on ? brief.tone.filter((x) => x !== t) : brief.tone.length < 5 ? [...brief.tone, t] : brief.tone)}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
          <Lines label="Websites you like (up to 3)" values={brief.likedSites} onChange={(v) => set("likedSites", v)} max={3} placeholder="https://" />
          <div>
            <label className={smallLabel}>What you don&apos;t want</label>
            <Textarea value={brief.dislikes} onChange={(e) => set("dislikes", e.target.value)} rows={3} maxLength={1000} className="w-full" placeholder="Stock photos of handshakes. Pop-ups. Looking like every other HVAC site in town." />
          </div>
        </div>
      </section>

      {/* Links */}
      <section className="ds-card p-5 mb-6">
        <h2 className="ds-h2 flex items-center gap-1.5 mb-4">
          Links and prices
          <InfoTip>Your Google Business Profile link lets the site match your listing exactly (name, address, phone), which is what local search rewards. Prices come from your price book when the switch is on.</InfoTip>
        </h2>
        <div className="space-y-4">
          <div>
            <label className={smallLabel}>Google Business Profile</label>
            <Input value={brief.googleBusinessUrl} onChange={(e) => set("googleBusinessUrl", e.target.value)} placeholder="https://maps.app.goo.gl/…" className="w-full" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {SOCIAL_KEYS.map((k) => (
              <div key={k}>
                <label className={smallLabel}>{SOCIAL_LABEL[k]}</label>
                <Input value={brief.socials[k]} onChange={(e) => set("socials", { ...brief.socials, [k]: e.target.value })} placeholder="https://" className="w-full" />
              </div>
            ))}
          </div>
          <Toggle label="Show my price-book prices on the site" value={brief.showPrices} onChange={(v) => set("showPrices", v)} />
        </div>
      </section>

      {/* FAQ */}
      <section className="ds-card p-5 mb-6">
        <h2 className="ds-h2 flex items-center gap-1.5 mb-4">
          Questions customers ask
          <InfoTip>Real questions and your real answers. They become the FAQ on the site and are marked up for search engines.</InfoTip>
        </h2>
        <div className="space-y-3">
          {brief.faqs.map((f, i) => (
            <div key={i} className="rounded-[12px] border border-[color:var(--ds-line)] p-3 space-y-2">
              <div className="flex items-start gap-2">
                <Input value={f.q} onChange={(e) => set("faqs", brief.faqs.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} placeholder="Do you charge for the visit?" maxLength={160} className="w-full" />
                <button type="button" className="p-2 text-[color:var(--ds-muted)] hover:text-[color:var(--ds-bad)]" aria-label="Remove question" onClick={() => set("faqs", brief.faqs.filter((_, j) => j !== i))}>
                  <Trash2 size={14} />
                </button>
              </div>
              <Textarea value={f.a} onChange={(e) => set("faqs", brief.faqs.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} rows={2} maxLength={800} className="w-full" placeholder="Your answer" />
            </div>
          ))}
          {brief.faqs.length < 12 && (
            <button type="button" className="ds-btn ds-btn-outline ds-btn-sm" onClick={() => set("faqs", [...brief.faqs, { q: "", a: "" }])}>
              <Plus size={14} /> Add a question
            </button>
          )}
        </div>
      </section>

      {/* Photos */}
      <PhotosCard photos={photos} setPhotos={setPhotos} onError={setError} />
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-[12px] border border-[color:var(--ds-line)] px-3 py-2.5 text-sm cursor-pointer">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${value ? "bg-[color:var(--ds-primary)]" : "bg-[color:var(--ds-line-strong)]"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${value ? "left-0.5 translate-x-5" : "left-0.5"}`} />
      </button>
    </label>
  );
}

/** Tag-style list: type, Enter or comma adds. */
function ChipList({ label, help, values, onChange, placeholder, max = 12 }: { label: string; help?: string; values: string[]; onChange: (v: string[]) => void; placeholder?: string; max?: number }) {
  const [draft, setDraft] = useState("");
  function add() {
    const v = draft.trim();
    if (!v || values.length >= max || values.some((x) => x.toLowerCase() === v.toLowerCase())) return setDraft("");
    onChange([...values, v]);
    setDraft("");
  }
  return (
    <div>
      <label className={smallLabel}>
        {label}
        {help && <span className="ml-1 font-normal text-[color:var(--ds-faint)]">{help}</span>}
      </label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-[9px] bg-[color:var(--ds-surface-2)] px-2.5 py-1 text-xs font-medium">
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))} className="text-[color:var(--ds-muted)] hover:text-[color:var(--ds-bad)]">
              <X size={11} />
            </button>
          </span>
        ))}
      </div>
      {values.length < max && (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className={inputCls}
        />
      )}
    </div>
  );
}

/** A short list of one-line entries. */
function Lines({ label, values, onChange, max, placeholder }: { label: string; values: string[]; onChange: (v: string[]) => void; max: number; placeholder?: string }) {
  const rows = values.length < max ? [...values, ""] : values;
  return (
    <div>
      <label className={smallLabel}>{label}</label>
      <div className="space-y-2">
        {rows.map((v, i) => (
          <Input
            key={i}
            value={v}
            placeholder={placeholder}
            className="w-full"
            onChange={(e) => {
              const next = [...rows];
              next[i] = e.target.value;
              onChange(next.filter((x) => x.trim()).slice(0, max));
            }}
          />
        ))}
      </div>
    </div>
  );
}

function PhotosCard({ photos, setPhotos, onError }: { photos: Photo[]; setPhotos: (f: (p: Photo[]) => Photo[]) => void; onError: (e: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState("truck");
  const [busy, setBusy] = useState(false);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    onError("");
    try {
      for (const file of Array.from(files)) {
        const { blob, filename } = await resizePhotoFile(file, 2400);
        const form = new FormData();
        form.append("file", new File([blob], filename, { type: blob.type }));
        form.append("kind", kind);
        const res = await fetch("/api/app/website/photos", { method: "POST", body: form });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          onError(data?.error ?? GENERIC_ERROR);
          break;
        }
        setPhotos((p) => [...p, data.photo as Photo]);
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function saveAlt(photo: Photo, alt: string) {
    const url = photo.source === "upload" ? `/api/app/website/photos/${photo.id}` : `/api/app/jobs/${photo.jobId}/photos/${photo.id}`;
    const { ok, data } = await postJson(url, { alt }, "PATCH");
    if (!ok) onError(data?.error ?? GENERIC_ERROR);
  }

  async function remove(photo: Photo) {
    const upload = photo.source === "upload";
    if (
      !(await confirmSheet({
        title: upload ? "Remove this photo?" : "Take this photo off the website?",
        message: upload ? "It comes off the site. The file is deleted." : "It stays on the job, just not on the site.",
        confirmLabel: upload ? "Remove" : "Take it off",
        destructive: upload,
      }))
    )
      return;
    const { ok, data } = upload
      ? await postJson(`/api/app/website/photos/${photo.id}`, undefined, "DELETE")
      : await postJson(`/api/app/jobs/${photo.jobId}/photos/${photo.id}`, { siteUse: false }, "PATCH");
    if (!ok) return onError(data?.error ?? GENERIC_ERROR);
    setPhotos((p) => p.filter((x) => x.id !== photo.id));
  }

  return (
    <section className="ds-card p-5 mb-6">
      <h2 className="ds-h2 flex items-center gap-1.5 mb-1">
        Photos
        <InfoTip>
          Real photos are what make a site look like yours and not a template: your truck, your crew, your work. Job photos join from the job page (the globe on a photo: &ldquo;Use on website&rdquo;). Describe each one in a few words — that text is what search engines and screen readers read.
        </InfoTip>
      </h2>
      <p className="text-xs text-[color:var(--ds-muted)] mb-4">Phone photos are fine. No stock photos — if you have none yet, the site is designed around type and color instead.</p>

      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          {photos.map((photo) => (
            <div key={photo.id} className="rounded-[12px] border border-[color:var(--ds-line)] overflow-hidden">
              <div className="relative aspect-[4/3] bg-[color:var(--ds-surface-2)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt={photo.alt || photo.kind} className="h-full w-full object-cover" />
                <span className="absolute bottom-1 left-1 rounded-lg bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {photo.source === "job" ? "Job photo" : PHOTO_KINDS.find((k) => k.value === photo.kind)?.label ?? photo.kind}
                </span>
                <button type="button" onClick={() => void remove(photo)} className="absolute top-1 right-1 rounded-full bg-black/50 p-1 text-white" aria-label="Remove">
                  <Trash2 size={12} />
                </button>
              </div>
              <div className="p-2">
                <input
                  defaultValue={photo.alt}
                  placeholder="Describe it: 'Our van outside a job in Allen'"
                  maxLength={160}
                  className={`${inputCls} !px-2 !py-1.5 !text-xs`}
                  onBlur={(e) => {
                    if (e.target.value !== photo.alt) void saveAlt(photo, e.target.value);
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => void onFiles(e.target.files)} />
        <Select value={kind} onChange={(e) => setKind(e.target.value)} disabled={busy} className="!w-auto !py-1.5 !text-xs">
          {PHOTO_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="ds-btn ds-btn-outline ds-btn-sm disabled:opacity-50">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
          Add photos
        </button>
      </div>
    </section>
  );
}
