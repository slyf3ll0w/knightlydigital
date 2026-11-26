import { notFound } from "next/navigation";
import { Images } from "lucide-react";
import { prisma } from "@/lib/db";
import { galleryStateFor } from "@/lib/gallery-preview";
import { hubPhotoSrc } from "@/lib/photos-shared";
import { HubEmpty, HubGroup, HubPageHead, HubRow } from "../HubKit";

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
      <HubPageHead
        title="Completed work"
        note={
          contact.jobs.length === 0
            ? "Reports from finished visits show up here"
            : contact.jobs.length === 1
              ? "1 finished visit"
              : `${contact.jobs.length} finished visits`
        }
      />
      {contact.jobs.length === 0 ? (
        <HubEmpty title="No completed visits yet" body="When a visit wraps up, its report shows up here with the photos." />
      ) : (
        <HubGroup flush>
          {contact.jobs.map((j) => {
            const when = j.completedAt ?? j.closedAt;
            const cover = j.photos[0];
            const date = when
              ? when.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: tz })
              : "Completed";
            const photos = j._count.photos > 0 ? ` · ${j._count.photos} ${j._count.photos === 1 ? "photo" : "photos"}` : "";
            return (
              <HubRow
                key={j.id}
                href={`${base}/work/${j.id}`}
                lead={
                  cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={hubPhotoSrc(token, cover.id, cover.thumbKey ? "thumb" : "full")} alt="" className="hk-thumb" />
                  ) : (
                    <span className="hk-ic is-quiet">
                      <Images size={17} strokeWidth={2.2} />
                    </span>
                  )
                }
                title={j.title}
                sub={date + photos}
              />
            );
          })}
        </HubGroup>
      )}
    </div>
  );
}
