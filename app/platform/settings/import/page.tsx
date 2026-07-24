import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import Link from "next/link";
import { Lock } from "lucide-react";
import { getActiveFieldDefs } from "@/lib/contact-fields";
import { inPreview } from "@/lib/preview";
import ImportClient from "./ImportClient";

export const metadata: Metadata = { title: "Import Clients" };

export default async function ImportPage() {
  const actor = await requirePageActor((a) => isManager(a.role));

  // Preview accounts can't bulk-load their client base before approval —
  // the API is blocked too; this page just says so nicely.
  if (await inPreview(actor.companyId)) {
    return (
      <div className="p-4 lg:p-8 max-w-2xl mx-auto">
        <div className="card-ledger p-8 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50">
            <Lock size={18} className="text-amber-600" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-gray-900">
            CSV import unlocks at approval
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            Bringing in your full client list opens up once your account is approved — usually
            within a business day of finishing payment verification. Until then you can add up
            to 10 clients by hand to try things out.
          </p>
          <Link
            href="/app/activate"
            className="mt-5 inline-flex items-center justify-center rounded-lg bg-[#0B57D8] px-5 py-2.5 text-sm font-bold text-white"
          >
            Finish verification
          </Link>
        </div>
      </div>
    );
  }

  const [users, fieldDefs] = await Promise.all([
    prisma.user.findMany({
      where: { companyId: actor.companyId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    getActiveFieldDefs(actor.companyId),
  ]);

  return (
    <ImportClient
      actorId={actor.id}
      users={users}
      fieldDefs={fieldDefs.map((d) => ({ id: d.id, label: d.label }))}
    />
  );
}
