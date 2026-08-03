import { Search } from "lucide-react";

/**
 * Phone-only search field for list pages (Jobs / Invoices / Requests — the
 * desktop console reaches these through its own layouts, and the header
 * client search is hidden on phones). Plain GET form so server components
 * can use it: submits ?q= to the page itself, carrying any active filters
 * through hidden inputs.
 */
export default function MobileSearch({
  action,
  placeholder,
  defaultValue,
  params,
}: {
  action: string;
  placeholder: string;
  defaultValue?: string;
  /** Active filter params to preserve on submit (empty values dropped) */
  params?: Record<string, string | undefined>;
}) {
  return (
    <form method="get" action={action} className="relative mb-3 lg:hidden">
      <Search
        size={16}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
      />
      <input
        type="search"
        name="q"
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className="w-full rounded-[12px] border border-transparent bg-gray-100 py-2.5 pl-10 pr-4 text-[16px] text-gray-900 placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus:outline-none transition-colors"
      />
      {params &&
        Object.entries(params)
          .filter(([, v]) => v)
          .map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
    </form>
  );
}
