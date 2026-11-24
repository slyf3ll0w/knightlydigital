/**
 * Desktop loading skeletons in the new look (2026-11-24): the white open
 * page, the page's own header (context line, big title, actions on the
 * right), hairlines instead of cards, sections under a bold title with the
 * two-color bar. Home's adds the branded band. Phones keep the older shapes
 * in components/ListSkeleton.tsx (each export there renders both).
 * Colours come from the kit tokens, so light and Dusk both work.
 */

const bar = (w: string, h = "h-3.5", strong = false) => (
  <div
    className={`${h} ${w} max-w-full rounded-md ${strong ? "bg-[color:var(--ds-line-strong)]" : "bg-[color:var(--ds-line)]"}`}
  />
);

/** The section title with its two-color bar, as a placeholder on the hairline. */
function SecHead({ w = "w-28", aside = false }: { w?: string; aside?: boolean }) {
  return (
    <div className="flex items-end justify-between border-b border-[color:var(--ds-line-strong)]">
      <div className="relative pb-3">
        {bar(w, "h-[18px]", true)}
        <span
          aria-hidden
          className="absolute -bottom-[2px] left-0 h-[3px] w-10 rounded-[1px] opacity-40"
          style={{ background: "linear-gradient(90deg, var(--ds-primary) 0 66%, var(--ds-secondary) 66%)" }}
        />
      </div>
      {aside && <div className="pb-2.5">{bar("w-24", "h-6")}</div>}
    </div>
  );
}

/** The page header: context line, title, actions. */
function Head({ crumbs = false, actions = 2 }: { crumbs?: boolean; actions?: number }) {
  return (
    <div className="mb-8 flex items-end justify-between gap-6">
      <div className="min-w-0">
        {bar(crumbs ? "w-40" : "w-64", "h-3")}
        <div className="mt-3">{bar("w-52", "h-8", true)}</div>
      </div>
      <div className="flex items-center gap-2">
        {actions > 1 && <div className="h-10 w-28 rounded-[10px] bg-[color:var(--ds-line)]" />}
        {actions > 0 && <div className="h-10 w-32 rounded-[10px] bg-[color:var(--ds-line-strong)]" />}
      </div>
    </div>
  );
}

function Rows({ n = 8, avatar = true }: { n?: number; avatar?: boolean }) {
  return (
    <div>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex h-14 items-center gap-4 border-b border-[color:var(--ds-line)] last:border-b-0">
          {avatar && <div className="h-7 w-7 shrink-0 rounded-full bg-[color:var(--ds-line)]" />}
          <div className="min-w-0 flex-1">
            {bar(i % 3 === 0 ? "w-48" : i % 3 === 1 ? "w-40" : "w-56", "h-3.5", true)}
            <div className="mt-1.5">{bar("w-28", "h-3")}</div>
          </div>
          <div className="w-28">{bar("w-20", "h-3")}</div>
          <div className="w-32">{bar("w-24", "h-3")}</div>
          <div className="h-5 w-20 rounded-[5px] bg-[color:var(--ds-line)]" />
          <div className="w-20 text-right">{bar("ml-auto w-16", "h-3.5", true)}</div>
        </div>
      ))}
    </div>
  );
}

/** A list page: header, an optional picture area, the tab row, the table. */
export function OpenListSkeleton({ picture = false, tabs = 4, rows = 8 }: { picture?: boolean; tabs?: number; rows?: number }) {
  return (
    <div className="ds bb-wrap bb-open">
      <div className="mx-auto w-full max-w-6xl animate-pulse px-8 pb-10 pt-8">
        <Head />
        {picture && (
          <div className="mb-8 flex h-[120px] items-end gap-3 border-t border-[color:var(--ds-line)] pt-5">
            {[38, 64, 30, 82, 52, 70, 44].map((h, i) => (
              <div key={i} className="flex-1 rounded-t-md bg-[color:var(--ds-line)]" style={{ height: `${h}%` }} />
            ))}
          </div>
        )}
        <div className="flex h-[52px] items-center gap-5 border-b border-[color:var(--ds-line-strong)]">
          {Array.from({ length: Math.max(1, tabs) }, (_, i) => (
            <div key={i}>{bar(i === 0 ? "w-12" : "w-20", "h-3.5", i === 0)}</div>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <div className="h-9 w-48 rounded-[9px] bg-[color:var(--ds-line)]" />
            <div className="h-9 w-32 rounded-[9px] bg-[color:var(--ds-line)]" />
          </div>
        </div>
        <div className="flex h-10 items-center gap-4 border-b border-[color:var(--ds-line)]">
          {bar("w-24", "h-3")}
        </div>
        <Rows n={rows} />
      </div>
    </div>
  );
}

/** A record's page: crumbs + title, the facts strip, the track, main + inspector. */
export function OpenDetailSkeleton({ sidebar = true }: { sidebar?: boolean }) {
  return (
    <div className="ds bb-wrap bb-open">
      <div className="mx-auto w-full max-w-6xl animate-pulse px-8 pb-10 pt-8">
        <Head crumbs />
        {/* facts strip */}
        <div className="flex items-end gap-0 border-b border-[color:var(--ds-line-strong)] pb-6">
          <div className="pr-8">
            {bar("w-20", "h-3")}
            <div className="mt-2.5">{bar("w-44", "h-9", true)}</div>
          </div>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="border-l border-[color:var(--ds-line)] px-6">
              {bar("w-14", "h-3")}
              <div className="mt-2.5">{bar("w-24", "h-4", true)}</div>
            </div>
          ))}
        </div>
        {/* track */}
        <div className="grid grid-cols-4 gap-3 border-b border-[color:var(--ds-line)] py-5">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i}>
              <div className="flex items-center gap-2">
                <div className="h-3.5 w-3.5 shrink-0 rounded-full bg-[color:var(--ds-line-strong)]" />
                <div className="h-[2px] flex-1 bg-[color:var(--ds-line)]" />
              </div>
              <div className="mt-2.5">{bar("w-16", "h-3.5", true)}</div>
              <div className="mt-1.5">{bar("w-24", "h-3")}</div>
            </div>
          ))}
        </div>
        <div className={`mt-10 grid gap-14 ${sidebar ? "grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" : ""}`}>
          <div>
            <SecHead aside />
            <Rows n={4} avatar={false} />
          </div>
          {sidebar && (
            <div className="flex flex-col gap-10">
              <div>
                <SecHead w="w-20" />
                <div className="space-y-2.5 pt-4">
                  {bar("w-36", "h-4", true)}
                  {bar("w-44", "h-3")}
                  {bar("w-40", "h-3")}
                </div>
              </div>
              <div>
                <SecHead w="w-24" />
                <div className="space-y-2.5 pt-4">
                  {bar("w-full", "h-3")}
                  {bar("w-2/3", "h-3")}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Any other page: header + three open sections. */
export function OpenPageSkeleton() {
  return (
    <div className="ds bb-wrap bb-open">
      <div className="mx-auto w-full max-w-6xl animate-pulse px-8 pb-10 pt-8">
        <Head actions={1} />
        <div className="flex flex-col gap-11">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <SecHead w={i === 1 ? "w-36" : "w-28"} />
              <div className="space-y-3 pt-5">
                {bar("w-full")}
                {bar("w-5/6")}
                {bar("w-2/3")}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Home: the branded band with the greeting's shape, then the open sections. */
export function OpenHomeSkeleton() {
  const onBand = (w: string, h: string) => <div className={`${h} ${w} rounded-md bg-white/20`} />;
  return (
    <div className="ds bb-wrap">
      <div className="bb-band">
        <div className="ds bb-page mx-auto w-full max-w-6xl animate-pulse px-8 pt-8">
          <div className="ds-pagehead flex items-center justify-between gap-6">
            <div>
              {onBand("w-40", "h-3")}
              <div className="mt-3">{onBand("w-80", "h-9")}</div>
            </div>
            <div className="flex gap-2">
              <div className="h-10 w-28 rounded-[10px] bg-white/15" />
              <div className="h-10 w-28 rounded-[10px] bg-white/30" />
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-6xl animate-pulse px-8 pb-10 pt-10">
        <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-14">
          <div>
            <SecHead w="w-28" />
            <Rows n={5} avatar={false} />
          </div>
          <div>
            <SecHead w="w-20" />
            <div className="pt-4">
              {bar("w-36", "h-3")}
              <div className="mt-2.5">{bar("w-40", "h-8", true)}</div>
              <div className="mt-5 flex h-12 items-end gap-1">
                {Array.from({ length: 24 }, (_, i) => (
                  <div key={i} className="flex-1 rounded-t-sm bg-[color:var(--ds-line)]" style={{ height: `${12 + ((i * 37) % 70)}%` }} />
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-11">
          <SecHead w="w-20" aside />
          <Rows n={4} />
        </div>
      </div>
    </div>
  );
}
