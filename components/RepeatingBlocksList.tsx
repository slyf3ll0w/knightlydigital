"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Repeat } from "lucide-react";
import { InfoTip } from "@/components/ds";
import RepeatingBlockSheet from "@/components/RepeatingBlockSheet";
import { describeRule } from "@/lib/time-block-recurrence";
import type { SeriesDTO } from "@/lib/time-block-series";

/**
 * Settings → Booking → Scheduling rules: the company's repeating blocks,
 * right under business hours. Each row is one rule ("Lunch · Every weekday,
 * 12:00 PM – 1:00 PM · Everyone"); tapping it opens the editor. Booking
 * forms show these times as taken and the Schedule carries them as blocks.
 */
export default function RepeatingBlocksList({
  series,
  users,
  meId,
  canBlockForOthers,
}: {
  series: SeriesDTO[];
  users: { id: string; name: string }[];
  meId: string;
  canBlockForOthers: boolean;
}) {
  const router = useRouter();
  const [sheet, setSheet] = useState<null | { initial: SeriesDTO | null }>(null);

  const whoLabel = (s: SeriesDTO) => (s.userId === null ? "Everyone" : s.userId === meId ? "Me" : (s.userName ?? "A teammate"));

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <p className="text-sm font-medium text-gray-900">
          Repeating blocks
          <InfoTip>Times nobody can book every week — lunch, a standing appointment, Fridays off. Booking forms show them as taken and they sit on the Schedule as blocked time. Business hours stay as they are.</InfoTip>
        </p>
        <button type="button" onClick={() => setSheet({ initial: null })} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--ds-primary)] hover:underline">
          <Plus size={14} /> Add
        </button>
      </div>
      {series.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 px-3 py-2.5 text-xs text-gray-500">None yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {series.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setSheet({ initial: s })}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
              >
                <Repeat size={15} className="shrink-0 text-gray-400" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-900">{s.title}</span>
                  <span className="block truncate text-xs text-gray-500">
                    {describeRule(s)} · {whoLabel(s)}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-medium text-gray-500">{s.canEdit ? "Edit" : "View"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <RepeatingBlockSheet
        open={Boolean(sheet)}
        initial={sheet?.initial ?? null}
        users={users}
        meId={meId}
        canBlockForOthers={canBlockForOthers}
        onClose={() => setSheet(null)}
        onSaved={() => {
          setSheet(null);
          router.refresh();
        }}
        onRemoved={() => {
          setSheet(null);
          router.refresh();
        }}
      />
    </div>
  );
}
