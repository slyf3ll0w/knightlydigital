import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HelpTopicView from "@/components/help/HelpTopicView";
import { findHelpSection } from "@/lib/help/search";
import { requirePageActor } from "@/lib/permissions";
import { DsPage } from "@/components/ds";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const section = findHelpSection((await params).id);
  return { title: section ? `${section.title} · Help` : "Help Center" };
}

export default async function AppHelpTopicPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageActor();
  const section = findHelpSection((await params).id);
  if (!section) notFound();
  return (
    <DsPage open className="rp-help !max-w-none !px-0 !pb-0 !pt-0 lg:!px-0 lg:!pt-0">
      <HelpTopicView section={section} base="/app/help" inApp />
    </DsPage>
  );
}
