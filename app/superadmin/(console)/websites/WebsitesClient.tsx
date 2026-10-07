"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Hammer, Loader2, Save } from "lucide-react";
import { Button, Card, Chip, DsPage, PageHeader } from "@/components/ds";
import { Input, Select, Textarea } from "@/components/Input";
import { fullDate } from "@/lib/console-format";
import type { WebsiteBrief } from "@/lib/website-brief";

type Status = "NOT_STARTED" | "BRIEF_SUBMITTED" | "IN_STUDIO" | "REVIEW" | "LIVE";

export type WebsiteRow = {
  companyId: string;
  companyName: string;
  slug: string;
  industry: string | null;
  place: string;
  companyWebsite: string | null;
  status: Status;
  brief: WebsiteBrief;
  gaps: string[];
  photoCount: number;
  briefSubmittedAt: string | null;
  domain: string | null;
  pagesProject: string | null;
  previewUrl: string | null;
  direction: string | null;
  notes: string | null;
  liveAt: string | null;
  rebuildQueuedAt: string | null;
  rebuildSentAt: string | null;
  rebuildReason: string | null;
  rebuildError: string | null;
  siteDataUrl: string;
  bookingUrl: string;
};

const STATUS: Record<Status, { label: string; tone: "neutral" | "primary" | "secondary" | "good" | "warn" }> = {
  NOT_STARTED: { label: "Not started", tone: "neutral" },
  BRIEF_SUBMITTED: { label: "Brief in", tone: "warn" },
  IN_STUDIO: { label: "In the studio", tone: "primary" },
  REVIEW: { label: "In review", tone: "secondary" },
  LIVE: { label: "Live", tone: "good" },
};

const ORDER: Status[] = ["BRIEF_SUBMITTED", "IN_STUDIO", "REVIEW", "LIVE", "NOT_STARTED"];

export default function WebsitesClient({ rows, dispatchConfigured }: { rows: WebsiteRow[]; dispatchConfigured: boolean }) {
  const queue = rows.filter((r) => r.status !== "NOT_STARTED" && r.status !== "LIVE").length;
  const sorted = [...rows].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  return (
    <DsPage>
      <PageHeader
        eyebrow={`${queue} in the studio · ${rows.filter((r) => r.status === "LIVE").length} live`}
        title="Websites"
        info="Every company that opened Settings → Website. A brief that was sent in is the queue. The site itself is built in the workbench-sites repo (one Astro project per client, deployed to Cloudflare Pages) from the company's site data; Rebuild now sends a GitHub dispatch that rebuilds and redeploys it. Mark a site Live with its domain to show the owner and to fill the company's website field."
      />
      {!dispatchConfigured && (
        <p className="mt-4 text-[13px] text-[color:var(--ds-warn)]">
          SITES_DISPATCH_TOKEN is not set on this environment: rebuilds are recorded but not sent.
        </p>
      )}
      <div className="mt-6 space-y-3">
        {sorted.length === 0 && (
          <Card className="px-6 py-9 text-center">
            <p className="ds-small">Nobody has opened Settings → Website yet.</p>
          </Card>
        )}
        {sorted.map((r) => (
          <Row key={r.companyId} row={r} />
        ))}
      </div>
    </DsPage>
  );
}

function Row({ row }: { row: WebsiteRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(row.status === "BRIEF_SUBMITTED");
  const [showBrief, setShowBrief] = useState(false);
  const [form, setForm] = useState({
    status: row.status,
    domain: row.domain ?? "",
    pagesProject: row.pagesProject ?? "",
    previewUrl: row.previewUrl ?? "",
    direction: row.direction ?? "",
    notes: row.notes ?? "",
  });
  const [busy, setBusy] = useState<"save" | "rebuild" | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const st = STATUS[row.status];

  async function call(body: Record<string, unknown>, kind: "save" | "rebuild") {
    setBusy(kind);
    setError("");
    setNote("");
    try {
      const res = await fetch(`/api/superadmin/websites/${row.companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong.");
        return;
      }
      if (kind === "rebuild") setNote(data?.sent ? "Dispatch sent — the Actions run is building it." : "Queued, but no SITES_DISPATCH_TOKEN on this environment.");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const b = row.brief;
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <button type="button" className="min-w-0 text-left" onClick={() => setOpen((o) => !o)}>
          <h3 className="ds-h2">
            {row.companyName}
            <span className="font-normal text-[color:var(--ds-muted)]">
              {" "}
              · {row.industry ?? "trade?"}
              {row.place ? ` · ${row.place}` : ""}
            </span>
          </h3>
          <p className="ds-small">
            {row.briefSubmittedAt ? `Brief sent ${fullDate(row.briefSubmittedAt)}` : "Brief not sent"}
            {row.direction ? ` · ${row.direction}` : ""}
            {row.domain ? ` · ${row.domain}` : ""}
            {` · ${row.photoCount} photo${row.photoCount === 1 ? "" : "s"}`}
          </p>
        </button>
        <Chip tone={st.tone}>{st.label}</Chip>
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13.5px]">
            <a href={row.siteDataUrl} target="_blank" rel="noreferrer" className="ds-link inline-flex items-center gap-1">
              Site data <ExternalLink size={12} />
            </a>
            <a href={row.bookingUrl} target="_blank" rel="noreferrer" className="ds-link inline-flex items-center gap-1">
              Booking page <ExternalLink size={12} />
            </a>
            {row.previewUrl && (
              <a href={row.previewUrl} target="_blank" rel="noreferrer" className="ds-link inline-flex items-center gap-1">
                Preview <ExternalLink size={12} />
              </a>
            )}
            {row.domain && (
              <a href={`https://${row.domain}`} target="_blank" rel="noreferrer" className="ds-link inline-flex items-center gap-1">
                {row.domain} <ExternalLink size={12} />
              </a>
            )}
            <button type="button" className="ds-link" onClick={() => setShowBrief((s) => !s)}>
              {showBrief ? "Hide the brief" : "Read the brief"}
            </button>
          </div>

          {row.gaps.length > 0 && <p className="text-[13px] text-[color:var(--ds-muted)]">Left blank (fill from the trade sheet): {row.gaps.join(", ").toLowerCase()}.</p>}

          {showBrief && (
            <div className="rounded-[12px] border border-[color:var(--ds-line)] p-4 text-[13.5px] space-y-2">
              <Line k="Tagline" v={b.tagline} />
              <Line k="Story" v={b.story} pre />
              <Line k="Founded" v={b.foundedYear ? String(b.foundedYear) : ""} />
              <Line k="Licenses" v={b.licenses.join(", ")} />
              <Line k="Insured" v={b.insured ? "yes" : "no"} />
              <Line k="Guarantee" v={b.guarantee} />
              <Line k="Brands" v={b.brands.join(", ")} />
              <Line k="Emergency" v={b.emergency ? "24/7" : "no"} />
              <Line k="Financing" v={b.financing} />
              <Line k="Service areas" v={b.serviceAreas.join(", ")} />
              <Line k="Sets them apart" v={b.differentiators.join(" · ")} />
              <Line k="Tone" v={b.tone.join(", ")} />
              <Line k="Sites they like" v={b.likedSites.join("  ")} />
              <Line k="Don't want" v={b.dislikes} pre />
              <Line k="Show prices" v={b.showPrices ? "yes" : "no"} />
              <Line k="Google Business" v={b.googleBusinessUrl} />
              <Line
                k="Socials"
                v={Object.entries(b.socials)
                  .filter(([, v]) => v)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join("  ")}
              />
              <Line k="FAQ" v={b.faqs.map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n")} pre />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="ds-label mb-1 block">Status</span>
              <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Status }))} className="w-full">
                {(Object.keys(STATUS) as Status[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS[s].label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="ds-label mb-1 block">Direction they picked</span>
              <Input value={form.direction} onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))} placeholder="B — Shop ledger" className="w-full" />
            </label>
            <label className="block">
              <span className="ds-label mb-1 block">Domain</span>
              <Input value={form.domain} onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))} placeholder="harlowair.com" className="w-full" />
            </label>
            <label className="block">
              <span className="ds-label mb-1 block">Cloudflare Pages project</span>
              <Input value={form.pagesProject} onChange={(e) => setForm((f) => ({ ...f, pagesProject: e.target.value }))} placeholder={`wb-${row.slug}`} className="w-full" />
            </label>
            <label className="block sm:col-span-2">
              <span className="ds-label mb-1 block">Preview URL</span>
              <Input value={form.previewUrl} onChange={(e) => setForm((f) => ({ ...f, previewUrl: e.target.value }))} placeholder="https://wb-harlow.pages.dev" className="w-full" />
            </label>
            <label className="block sm:col-span-2">
              <span className="ds-label mb-1 block">Studio notes (never shown to the owner)</span>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} className="w-full" />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              icon={busy === "save" ? Loader2 : Save}
              disabled={Boolean(busy)}
              onClick={() =>
                void call(
                  {
                    status: form.status,
                    domain: form.domain,
                    pagesProject: form.pagesProject,
                    previewUrl: form.previewUrl,
                    direction: form.direction,
                    notes: form.notes,
                  },
                  "save"
                )
              }
            >
              Save
            </Button>
            {row.pagesProject ? (
              <Button size="sm" variant="outline" icon={busy === "rebuild" ? Loader2 : Hammer} disabled={Boolean(busy)} onClick={() => void call({ action: "rebuild" }, "rebuild")}>
                Rebuild now
              </Button>
            ) : (
              <span className="ds-small">No site yet — the studio builds the first version from the brief, then Rebuild now redeploys it.</span>
            )}
            <span className="ds-small">
              {row.rebuildError
                ? `Last rebuild: ${row.rebuildError}`
                : row.rebuildSentAt
                  ? `Last rebuild sent ${fullDate(row.rebuildSentAt)}${row.rebuildReason ? ` (${row.rebuildReason})` : ""}`
                  : row.rebuildQueuedAt
                    ? `Rebuild queued ${fullDate(row.rebuildQueuedAt)}`
                    : ""}
            </span>
          </div>
          {error && (
            <div role="alert" className="form-error">
              {error}
            </div>
          )}
          {note && <p className="ds-small">{note}</p>}
        </div>
      )}
    </Card>
  );
}

function Line({ k, v, pre = false }: { k: string; v: string; pre?: boolean }) {
  if (!v) return null;
  return (
    <p className={pre ? "whitespace-pre-wrap" : ""}>
      <span className="font-semibold">{k}:</span> {v}
    </p>
  );
}
