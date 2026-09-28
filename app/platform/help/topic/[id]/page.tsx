import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HelpTopicView from "@/components/help/HelpTopicView";
import { findHelpSection } from "@/lib/help/search";
import { requirePageActor } from "@/lib/permissions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const section = findHelpSection((await params).id);
  return { title: section ? `${section.title} · Help` : "Help Center" };
}

export default async function AppHelpTopicPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageActor();
  const section = findHelpSection((await params).id);
  if (!section) notFound();
  return <HelpTopicView section={section} base="/app/help" inApp />;
}
