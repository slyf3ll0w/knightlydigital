import { ShoppingBag } from "lucide-react";
import type { ScheduleAppearance } from "../schedule/shell";
import ClientMenuRow from "@/components/client/ClientMenuRow";

/** The "Shop" row on the business's booking page — one door to everything it sells online. */
export default function ShopRow({ companySlug, count, appearance }: { companySlug: string; count: number; appearance: ScheduleAppearance }) {
  return (
    <ClientMenuRow
      href={`/book/${companySlug}/shop`}
      icon={ShoppingBag}
      title="Shop"
      meta={`${count === 1 ? "1 product" : `${count} products`} · pay online`}
      appearance={appearance}
    />
  );
}
