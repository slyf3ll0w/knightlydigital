import { ChevronDown } from "lucide-react";

export type FaqItem = { q: string; a: React.ReactNode };

/**
 * FAQ accordion built on native <details>/<summary> — no client JS, works
 * with keyboard and screen readers out of the box.
 */
export default function WBFaq({ items }: { items: FaqItem[] }) {
  return (
    <div className="divide-y divide-gray-200 overflow-hidden rounded-2xl border border-gray-200 bg-white">
      {items.map(({ q, a }) => (
        <details key={q} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-[15px] font-bold text-gray-900 transition-colors hover:bg-gray-50 [&::-webkit-details-marker]:hidden">
            {q}
            <ChevronDown
              className="h-4 w-4 flex-none text-gray-400 transition-transform duration-200 group-open:rotate-180"
              strokeWidth={2.5}
            />
          </summary>
          <div className="px-6 pb-6 text-[14.5px] leading-relaxed text-gray-600">
            {a}
          </div>
        </details>
      ))}
    </div>
  );
}
