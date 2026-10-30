import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Images } from "lucide-react";
import { prisma } from "@/lib/db";
import { galleryStateFor } from "@/lib/gallery-preview";
import { hubPhotoSrc } from "@/lib/photos-shared";
import EmptyState from "@/components/EmptyState";

/**
 * Client hub: the work we've finished for you — one row per completed job
 * with a report (Gallery plan, phase B). Each opens the report page with
 * its photos, before/after pairs, checklist and PDF.
 */
export default async function HubWorkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const contact = await prisma.contact.findUnique({
    where: { hubToken: token },
    select: {
      id: true,
      companyId: true,
      company: { select: { timezone: true } },
      jobs: {
        where: { status: { in: ["REQUIRES_INVOICING", "ARCHIVED"] } },
        orderBy: [{ completedAt: "desc" }, { closedAt: "desc" }, { updatedAt: "desc" }],
        take: 50,
        select: {
          id: true,
          title: true,
          completedAt: true,
          closedAt: true,
          address: true,
          photos: { where: { clientVisible: true }, orderBy: [{ takenAt: "asc" }, { createdAt: "asc" }], take: 1, select: { id: true, thumbKey: true } },
          _count: { select: { photos: { where: { clientVisible: true } } } },
        },
      },
    },
  });
  if (!contact) notFound();
  const { open } = await galleryStateFor(contact.companyId);
  if (!open) notFound();

  const tz = contact.company.timezone;
  const base = `/hub/${token}`;

  return (
    <div>
      <h2 className="numeral-ledger relative mb-6 w-fit text-[22px] font-bold text-gray-900">Completed work</h2>
      <div className="card-ledger overflow-hidden">
        {contact.jobs.length === 0 ? (
          <EmptyState icon={Images} title="No completed visits yet" body="When a visit wraps up, its report shows up here with the photos." />
        ) : (
          <div className="list-settle divide-y divide-gray-100">
            {contact.jobs.map((j) => {
              const when = j.completedAt ?? j.closedAt;
              const cover = j.photos[0];
              return (
                <Link
                  key={j.id}
                  href={`${base}/work/${j.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 active:bg-gray-100"
                >
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={hubPhotoSrc(token, cover.id, cover.thumbKey ? "thumb" : "full")}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-md bg-gray-100 object-cover"
                    />
                  ) : (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-300">
                      <Images size={18} />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{j.title}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {when ? when.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: tz }) : "Completed"}
                      {j._count.photos > 0 ? ` · ${j._count.photos} ${j._count.photos === 1 ? "photo" : "photos"}` : ""}
                    </p>
                  </div>
                  <ChevronRight size={15} className="shrink-0 text-gray-400" />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
