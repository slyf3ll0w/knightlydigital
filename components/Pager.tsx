import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Server-component pager for the big list pages. Offset pagination via ?page=N
 * (1-based), preserving the page's active filters. Renders nothing when
 * everything fits on one page — the pre-pagination look stays untouched for
 * small shops.
 */
export default function Pager({
  basePath,
  params,
  page,
  pageSize,
  total,
}: {
  basePath: string;
  /** Active query params to carry (page is added automatically; empty dropped). */
  params?: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;

  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params ?? {})) if (v) q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const qs = q.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <p className="text-xs text-gray-500">
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </p>
      <div className="flex items-center gap-1.5">
        {page > 1 ? (
          <Link
            href={href(page - 1)}
            className="flex items-center gap-1 px-3 py-1.5 btn-tool-line bg-white text-xs font-medium text-gray-700 rounded-lg hover:bg-gray-50"
          >
            <ChevronLeft size={13} />
            Newer
          </Link>
        ) : null}
        {page < pages ? (
          <Link
            href={href(page + 1)}
            className="flex items-center gap-1 px-3 py-1.5 btn-tool-line bg-white text-xs font-medium text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Older
            <ChevronRight size={13} />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
