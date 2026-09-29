/**
 * The thread's own skeleton — a conversation's shape (header, a few bubbles,
 * a composer) instead of the inbox's list skeleton it used to inherit.
 */
export default function ThreadLoading() {
  const bubbles = [
    { mine: false, w: "w-[58%]" },
    { mine: false, w: "w-[34%]" },
    { mine: true, w: "w-[48%]" },
    { mine: false, w: "w-[62%]" },
    { mine: true, w: "w-[30%]" },
  ];
  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col lg:p-6">
      <div className="flex h-full min-h-0 flex-col bg-white animate-pulse lg:rounded-[8px] lg:border lg:border-gray-200">
        <div className="flex items-center gap-2.5 border-b border-gray-100 px-3 py-2.5 lg:px-4">
          <div className="h-9 w-9 rounded-full bg-[color:var(--ds-line)]" />
          <div className="h-[34px] w-[34px] rounded-full bg-[color:var(--ds-line-strong)]" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-36 rounded bg-[color:var(--ds-line-strong)]" />
            <div className="h-2.5 w-52 rounded bg-[color:var(--ds-line)]" />
          </div>
        </div>
        <div className="flex flex-1 flex-col justify-end gap-2 px-3 py-3 lg:px-4">
          {bubbles.map((b, i) => (
            <div key={i} className={`flex ${b.mine ? "justify-end" : "justify-start"}`}>
              <div className={`h-10 rounded-2xl ${b.w} ${b.mine ? "bg-[color:var(--ds-primary-soft)]" : "bg-[color:var(--ds-line)]"}`} />
            </div>
          ))}
        </div>
        <div className="border-t border-gray-100 px-3 py-2.5 lg:px-4">
          <div className="h-[42px] rounded-3xl bg-[color:var(--ds-line)]" />
        </div>
      </div>
    </div>
  );
}
