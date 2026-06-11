import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import ProductsClient from "./ProductsClient";

export const metadata: Metadata = { title: "Products & Services" };

export default async function ProductsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/app/login");
  const companyId = session.user.companyId;
  if (!companyId) redirect("/app/register");

  const items = await prisma.workItem.findMany({
    where: { companyId, isActive: true },
    orderBy: { name: "asc" },
  });

  return <ProductsClient initialItems={JSON.parse(JSON.stringify(items))} />;
}
