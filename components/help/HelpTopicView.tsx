import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { HelpSection } from "@/lib/help/types";
import HelpPageFrame from "./HelpPageFrame";

/** A topic's page: every guide in it, with its one-line summary. */
export default function HelpTopicView({ section, base, inApp }: { section: HelpSection; base: string; inApp: boolean }) {
  return (
    <HelpPageFrame
      base={base}
      inApp={inApp}
      section={section}
      title={section.title}
      summary={section.tagline}
      sidebar={{ kind: "topics" }}
    >
      <ul className="help-card max-w-3xl divide-y divide-gray-200 overflow-hidden">
        {section.articles.map((a) => (
          <li key={a.slug}>
            <Link
              prefetch={false}
              href={`${base}/${a.slug}`}
              className="group flex items-center gap-4 px-5 py-5 transition-colors hover:bg-[#F6F8FB] sm:px-6"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-bold text-gray-900 group-hover:text-[color:var(--hb-ink)]">{a.title}</span>
                <span className="mt-1 block text-[14.5px] leading-relaxed text-gray-600">{a.summary}</span>
              </span>
              <ChevronRight className="h-4 w-4 flex-none text-gray-300 group-hover:text-gray-500" strokeWidth={2.5} />
            </Link>
          </li>
        ))}
      </ul>
    </HelpPageFrame>
  );
}
