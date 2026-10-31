import Link from "next/link";
import { ChevronRight, ShoppingBag } from "lucide-react";
import type { ScheduleAppearance } from "../schedule/shell";
import { embedAccent, embedWash } from "@/lib/embed-style";

/** The "Shop" row on the business's booking page — one door to everything it sells online. */
export default function ShopRow({ companySlug, count, appearance }: { companySlug: string; count: number; appearance: ScheduleAppearance }) {
  const { dark, accent: savedAccent, transparent } = appearance;
  const accent = embedAccent(savedAccent);
  const card = transparent ? "border" : dark ? "bg-[#101410] border border-white/10" : "card-ledger";
  return (
    <Link
      href={`/book/${companySlug}/shop`}
      className={`${card} flex items-center gap-4 rounded-lg p-4 transition-opacity hover:opacity-90 ${dark ? "border-white/10" : ""}`}
      style={transparent ? { borderColor: embedWash(savedAccent, 33) } : undefined}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: embedWash(savedAccent, 13), color: accent }}>
        <ShoppingBag size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[15px] font-semibold ${dark ? "text-white" : "text-gray-900"}`}>Shop</span>
        <span className={`block text-xs ${dark ? "text-gray-400" : "text-gray-500"}`}>
          {count === 1 ? "1 product" : `${count} products`} · pay online
        </span>
      </span>
      <ChevronRight size={16} className={dark ? "text-gray-500" : "text-gray-400"} />
    </Link>
  );
}
