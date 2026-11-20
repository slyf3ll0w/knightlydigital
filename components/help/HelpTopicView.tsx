import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronRight } from "lucide-react";
import { HELP_SECTIONS } from "@/lib/help/content";
import type { HelpSection } from "@/lib/help/types";
import HelpPageFrame from "./HelpPageFrame";
import { HELP_ICONS } from "./icons";

/** A topic's page: every guide in it, with its one-line summary. */
export default function HelpTopicView({ section, base, inApp }: { section: HelpSection; base: string; inApp: boolean }) {
  // Public: the topics either side, so a phone (no sidebar) can keep going.
  const at = HELP_SECTIONS.findIndex((s) => s.id === section.id);
  const prevTopic = at > 0 ? HELP_SECTIONS[at - 1] : null;
  const nextTopic = at >= 0 && at < HELP_SECTIONS.length - 1 ? HELP_SECTIONS[at + 1] : null;

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
              className={`group flex items-center gap-4 px-5 transition-colors hover:bg-[#F6F8FB] sm:px-6 ${inApp ? "py-5" : "py-5 sm:py-6"}`}
            >
              <span className="min-w-0 flex-1">
                <span
                  className={`block font-bold text-gray-900 group-hover:text-[color:var(--hb-ink)] ${inApp ? "text-[16px]" : "text-[17.5px] !font-extrabold"}`}
                >
                  {a.title}
                </span>
                <span className="mt-1 block text-[14.5px] leading-relaxed text-gray-600">{a.summary}</span>
                {!inApp && a.where && (
                  <span className="mt-2 block text-[13px] font-semibold text-gray-400">In the app: {a.where.label}</span>
                )}
              </span>
              {inApp ? (
                <ChevronRight className="h-4 w-4 flex-none text-gray-300 group-hover:text-gray-500" strokeWidth={2.5} />
              ) : (
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#F5F7FA] text-[#F86A0A] transition-colors group-hover:bg-[#F86A0A] group-hover:text-white">
                  <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>

      {!inApp && (prevTopic || nextTopic) && (
        <div className={`mt-6 grid max-w-3xl gap-4 ${prevTopic && nextTopic ? "sm:grid-cols-2" : ""}`}>
          {[prevTopic && { s: prevTopic, dir: "prev" as const }, nextTopic && { s: nextTopic, dir: "next" as const }]
            .filter((x): x is { s: HelpSection; dir: "prev" | "next" } => Boolean(x))
            .map(({ s, dir }) => {
              const Icon = HELP_ICONS[s.icon];
              return (
                <Link
                  key={s.id}
                  prefetch={false}
                  href={`${base}/topic/${s.id}`}
                  className={`help-card group flex items-center gap-4 p-5 ${dir === "next" ? "sm:flex-row-reverse sm:text-right" : ""}`}
                >
                  <span className="help-tile">
                    <Icon className="h-5 w-5" strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`flex items-center gap-1.5 text-[13px] font-semibold text-gray-500 ${dir === "next" ? "sm:justify-end" : ""}`}>
                      {dir === "prev" ? <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} /> : null}
                      {dir === "prev" ? "Previous topic" : "Next topic"}
                      {dir === "next" ? <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} /> : null}
                    </span>
                    <span className="mt-0.5 block text-[16px] font-extrabold text-gray-900">{s.title}</span>
                  </span>
                </Link>
              );
            })}
        </div>
      )}
    </HelpPageFrame>
  );
}
