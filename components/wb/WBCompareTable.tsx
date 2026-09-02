export type CompareRow = {
  label: string;
  workbench: React.ReactNode;
  competitor: React.ReactNode;
};

/**
 * Side-by-side comparison table used on the /vs/[competitor] pages. Keep
 * rows factual and hedge anything price-related — competitor pricing pages
 * change without notice, and this table doesn't re-check them at build time.
 */
export default function WBCompareTable({
  competitorName,
  rows,
}: {
  competitorName: string;
  rows: CompareRow[];
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
      <table className="w-full min-w-[560px] border-collapse text-left">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-5 py-4 text-[12.5px] font-bold uppercase tracking-wide text-gray-400">
              &nbsp;
            </th>
            <th className="px-5 py-4 text-[14.5px] font-extrabold text-[#0B57D8]">WorkBench</th>
            <th className="px-5 py-4 text-[14.5px] font-extrabold text-gray-700">{competitorName}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="px-5 py-4 align-top text-[13.5px] font-bold text-gray-900">{r.label}</td>
              <td className="px-5 py-4 align-top text-[13.5px] leading-relaxed text-gray-600">{r.workbench}</td>
              <td className="px-5 py-4 align-top text-[13.5px] leading-relaxed text-gray-500">{r.competitor}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
