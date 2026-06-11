import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import ProductsClient from "./ProductsClient";

export const metadata: Metadata = { title: "Products & Services" };

export default async function ProductsPage() {
  const actor = await requirePageActor((a) => isManager(a.role));
  const companyId = actor.companyId;

  const items = await prisma.workItem.findMany({
    where: { companyId, isActive: true },
    orderBy: { name: "asc" },
  });

  return <ProductsClient initialItems={JSON.parse(JSON.stringify(items))} />;
}
