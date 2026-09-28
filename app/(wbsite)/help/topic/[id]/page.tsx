import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HelpTopicView from "@/components/help/HelpTopicView";
import { HELP_SECTIONS, findHelpSection } from "@/lib/help/search";

export function generateStaticParams() {
  return HELP_SECTIONS.map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const section = findHelpSection((await params).id);
  if (!section) return { title: "Help Center" };
  return {
    title: `${section.title} · Help`,
    description: section.tagline,
    alternates: { canonical: `https://workbenchfsm.com/help/topic/${section.id}` },
  };
}

export default async function PublicHelpTopicPage({ params }: { params: Promise<{ id: string }> }) {
  const section = findHelpSection((await params).id);
  if (!section) notFound();
  return <HelpTopicView section={section} base="/help" inApp={false} />;
}
