import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ShoppingBag } from "lucide-react";
import { companyMetaBySlug } from "@/lib/client-meta";
import { loadStore } from "@/lib/store";
import { money } from "@/lib/statuses";
import { embedAccent, embedWash } from "@/lib/embed-style";
import ScheduleFrame from "../schedule/ScheduleFrame";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return companyMetaBySlug(slug, "Shop");
}

/**
 * /book/[slug]/shop — everything the business sells online, one row per
 * product with its own buy page. Same frame and look as the booking page.
 */
export default async function ShopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await loadStore(slug);
  if (!store) notFound();
  const { company, appearance, products } = store;
  const { dark, accent: savedAccent, transparent } = appearance;
  const accent = embedAccent(savedAccent);
  const card = transparent ? "border" : dark ? "bg-[#101410] border border-white/10" : "card-ledger";
  const muted = dark ? "text-gray-400" : "text-gray-500";

  return (
    <ScheduleFrame company={company} appearance={appearance} title="Shop" subtitle={company.name} footer="slim">
      {products.length === 0 ? (
        <div className={`${card} rounded-lg p-6 text-center text-sm ${muted}`}>Nothing is for sale online right now — please contact us.</div>
      ) : (
        <div className="space-y-3">
          {products.map((p) => (
            <Link
              key={p.id}
              href={`/book/${slug}/shop/${p.id}`}
              className={`${card} flex items-center gap-4 rounded-lg p-4 transition-opacity hover:opacity-90 ${dark ? "border-white/10" : ""}`}
              style={transparent ? { borderColor: embedWash(savedAccent, 33) } : undefined}
            >
              {p.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.photoUrl} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover bg-gray-100" />
              ) : (
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: embedWash(savedAccent, 13), color: accent }}>
                  <ShoppingBag size={22} />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[15px] font-semibold ${dark ? "text-white" : "text-gray-900"}`}>{p.name}</span>
                {p.description && <span className={`mt-0.5 block truncate text-xs ${muted}`}>{p.description}</span>}
                <span className={`numeral-ledger mt-1 block text-sm font-medium ${dark ? "text-gray-200" : "text-gray-800"}`}>{money(p.unitPrice)}</span>
              </span>
              <ChevronRight size={16} className={muted} />
            </Link>
          ))}
        </div>
      )}
      <p className={`mt-6 text-center text-xs ${muted}`}>
        <Link href={`/book/${slug}`} className="hover:underline">
          Back to {company.name}
        </Link>
      </p>
    </ScheduleFrame>
  );
}
