import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, FileDown, Minus } from "lucide-react";
import { prisma } from "@/lib/db";
import { clientMayOpenReport, loadJobReport } from "@/lib/job-report";
import { STAGE_LABEL, hubPhotoSrc } from "@/lib/photos-shared";
import BeforeAfter from "@/components/BeforeAfter";
import HubPhotoStrip from "./HubPhotoStrip";

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

  return (
    <div className="space-y-4">
      <Link href={`${base}/work`} className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft size={14} /> Completed work
      </Link>

      <div className="card-ledger p-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Work completed</p>
        <h2 className="numeral-ledger mt-1 text-[22px] font-bold text-gray-900">{r.job.title}</h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          {done && (
            <div>
              <dt className="text-xs text-gray-500">Completed</dt>
              <dd className="font-medium text-gray-900">{longDate(done)}</dd>
            </div>
          )}
          {r.crew.length > 0 && (
            <div>
              <dt className="text-xs text-gray-500">{r.crew.length === 1 ? "Technician" : "Crew"}</dt>
              <dd className="font-medium text-gray-900">{r.crew.join(", ")}</dd>
            </div>
          )}
          {r.job.address && (
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-xs text-gray-500">Where</dt>
              <dd className="font-medium text-gray-900">{r.job.address}</dd>
            </div>
          )}
          {r.job.completionSignedAt && (
            <div className="col-span-2 sm:col-span-3">
              <dt className="text-xs text-gray-500">Signed off</dt>
              <dd className="font-medium text-gray-900">
                {r.job.completionSignatureName} · {longDate(r.job.completionSignedAt)}
              </dd>
            </div>
          )}
        </dl>
        {r.job.reportNote && (
          <blockquote className="mt-4 border-l-2 pl-3 text-sm text-gray-800 whitespace-pre-wrap" style={{ borderColor: "var(--wb-accent, #0B57D8)" }}>
            {r.job.reportNote}
            <footer className="mt-1 text-xs text-gray-500">— {r.crew.length === 1 ? r.crew[0] : r.job.company.name}</footer>
          </blockquote>
        )}
        <a
          href={`${base}/work/${r.job.id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[color:var(--wb-ink,#0B57D8)] hover:underline"
        >
          <FileDown size={15} /> Download the PDF
        </a>
      </div>

      {r.pairs.length > 0 && (
        <section className="card-ledger p-5">
          <h3 className="text-sm font-semibold text-gray-900">Before &amp; after</h3>
          <p className="mb-3 text-xs text-gray-500">Drag the handle to compare.</p>
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
        </section>
      )}

      {r.singles.length > 0 && (
        <section className="card-ledger p-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Photos</h3>
          <HubPhotoStrip
            photos={r.singles.map((p) => ({
              id: p.id,
              src: src(p.id),
              thumb: src(p.id, p.hasThumb ? "thumb" : "full"),
              label: [STAGE_LABEL[p.stage] || null, p.caption].filter(Boolean).join(" · "),
            }))}
          />
        </section>
      )}

      {(doneItems.length > 0 || skipped.length > 0) && (
        <section className="card-ledger p-5">
          <h3 className="mb-2 text-sm font-semibold text-gray-900">What was done</h3>
          <ul className="divide-y divide-gray-100">
            {doneItems.map((c) => (
              <li key={c.id} className="flex items-start gap-2 py-2 text-sm text-gray-800">
                <Check size={15} className="mt-0.5 shrink-0 text-green-600" />
                {c.label}
              </li>
            ))}
            {skipped.map((c) => (
              <li key={c.id} className="flex items-start gap-2 py-2 text-sm text-gray-500">
                <Minus size={15} className="mt-0.5 shrink-0 text-gray-400" />
                <span>
                  {c.label}
                  <span className="block text-xs">Not done: {c.skipReason}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
