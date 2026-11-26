import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, FileDown, Minus } from "lucide-react";
import { prisma } from "@/lib/db";
import { clientMayOpenReport, loadJobReport } from "@/lib/job-report";
import { STAGE_LABEL, hubPhotoSrc } from "@/lib/photos-shared";
import BeforeAfter from "@/components/BeforeAfter";
import HubPhotoStrip from "./HubPhotoStrip";
import { HubGroup, HubPageHead, HubRow } from "../../HubKit";

/**
 * The client's work completed report (Gallery plan, phase B): what we did,
 * who came, the before/after pairs with a drag slider, the other photos the
 * crew chose to show, the checklist as it was closed out, the sign-off, and
 * the PDF. Same data as the PDF (lib/job-report.ts loadJobReport).
 */
export default async function HubWorkReportPage({ params }: { params: Promise<{ token: string; jobId: string }> }) {
  const { token, jobId } = await params;
  const contact = await prisma.contact.findUnique({ where: { hubToken: token }, select: { id: true, companyId: true } });
  if (!contact) notFound();
  const r = await loadJobReport({ id: jobId, contactId: contact.id, companyId: contact.companyId });
  if (!r || !(await clientMayOpenReport(contact.companyId, r.job))) notFound();

  const tz = r.job.company.timezone ?? undefined;
  const done = r.job.completedAt ?? r.job.closedAt;
  const longDate = (d: Date) => d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: tz });
  const doneItems = r.checklist.filter((c) => c.done);
  const skipped = r.checklist.filter((c) => !c.done && c.skipReason);
  const base = `/hub/${token}`;
  const src = (id: string, size: "full" | "thumb" = "full") => hubPhotoSrc(token, id, size);

  const facts: { label: string; value: string }[] = [
    ...(done ? [{ label: "Completed", value: longDate(done) }] : []),
    ...(r.crew.length > 0 ? [{ label: r.crew.length === 1 ? "Technician" : "Crew", value: r.crew.join(", ") }] : []),
    ...(r.job.address ? [{ label: "Where", value: r.job.address }] : []),
    ...(r.job.completionSignedAt
      ? [{ label: "Signed off", value: `${r.job.completionSignatureName} · ${longDate(r.job.completionSignedAt)}` }]
      : []),
  ];

  return (
    <div>
      <Link href={`${base}/work`} className="hk-back">
        <ArrowLeft size={16} strokeWidth={2.4} /> Completed work
      </Link>
      <HubPageHead title={r.job.title} note={done ? `Completed ${longDate(done)}` : "Work completed"} />

      <div className="hk-page">
        <HubGroup title="The visit" flush>
          {facts.map((f) => (
            <div key={f.label} className="hk-row hk-kv">
              <span className="hk-kv-label">{f.label}</span>
              <span className="hk-kv-value">{f.value}</span>
            </div>
          ))}
          <HubRow
            href={`${base}/work/${r.job.id}/pdf`}
            external
            lead={
              <span className="hk-ic">
                <FileDown size={17} strokeWidth={2.2} />
              </span>
            }
            title="Download the PDF"
          />
        </HubGroup>

        {r.job.reportNote && (
          <HubGroup title="A note from us">
            <p className="whitespace-pre-wrap text-[15.5px] leading-relaxed text-[color:var(--hh-ink)]">{r.job.reportNote}</p>
            <p className="mt-2 text-[13.5px] text-[color:var(--hh-muted)]">— {r.crew.length === 1 ? r.crew[0] : r.job.company.name}</p>
          </HubGroup>
        )}

        {r.pairs.length > 0 && (
          <HubGroup title="Before & after">
            <p className="mb-3 text-[13.5px] text-[color:var(--hh-muted)]">Drag the handle to compare.</p>
            <div className="grid gap-5 sm:grid-cols-2">
              {r.pairs.map((pair) => (
                <BeforeAfter
                  key={pair.id}
                  variant="slider"
                  beforeSrc={src(pair.before.id)}
                  afterSrc={src(pair.after.id)}
                  beforeAlt={pair.before.caption ?? "Before"}
                  afterAlt={pair.after.caption ?? "After"}
                  caption={pair.after.caption ?? pair.before.caption}
                />
              ))}
            </div>
          </HubGroup>
        )}

        {r.singles.length > 0 && (
          <HubGroup title="Photos" count={r.singles.length}>
            <HubPhotoStrip
              photos={r.singles.map((p) => ({
                id: p.id,
                src: src(p.id),
                thumb: src(p.id, p.hasThumb ? "thumb" : "full"),
                label: [STAGE_LABEL[p.stage] || null, p.caption].filter(Boolean).join(" · "),
              }))}
            />
          </HubGroup>
        )}

        {(doneItems.length > 0 || skipped.length > 0) && (
          <HubGroup title="What was done" flush>
            {doneItems.map((c) => (
              <div key={c.id} className="hk-row has-lead hk-check">
                <span className="hk-lead">
                  <Check size={17} strokeWidth={2.6} className="text-[color:var(--hh-good)]" />
                </span>
                <span className="hk-row-text">
                  <span className="hk-row-title is-wrap">{c.label}</span>
                </span>
              </div>
            ))}
            {skipped.map((c) => (
              <div key={c.id} className="hk-row has-lead hk-check">
                <span className="hk-lead">
                  <Minus size={17} strokeWidth={2.6} className="text-[color:var(--hh-faint)]" />
                </span>
                <span className="hk-row-text">
                  <span className="hk-row-title is-wrap">{c.label}</span>
                  <span className="hk-row-sub is-wrap">Not done: {c.skipReason}</span>
                </span>
              </div>
            ))}
          </HubGroup>
        )}
      </div>
    </div>
  );
}
