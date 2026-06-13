import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import ProductsClient from "./ProductsClient";

export const metadata: Metadata = { title: "Products & Services" };

export default async function ProductsPage() {
  const actor = await requirePageActor((a) => isManager(a.role));
  const companyId = actor.companyId;

  const [items, templates] = await Promise.all([
    prisma.workItem.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.contractTemplate.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <ProductsClient
      initialItems={JSON.parse(JSON.stringify(items))}
      templates={templates}
    />
  );
}
