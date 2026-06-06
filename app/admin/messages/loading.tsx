import Image from "next/image";

export default function Loading() {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5F7F5' }}>
      <header
        className="shrink-0 z-30 flex items-center justify-between px-5"
        style={{ backgroundColor: '#0C0F0C', borderBottom: '1px solid rgba(255,255,255,0.08)', height: '56px' }}
      >
        <Image src="/logo.png" alt="Streamflaire" width={130} height={26} style={{ filter: 'brightness(0) invert(1)' }} />
        <div className="h-3 w-20 rounded animate-pulse" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden lg:flex w-52 shrink-0 flex-col" style={{ backgroundColor: '#ffffff', borderRight: '1px solid #E5E7EB' }}>
          <div className="flex flex-col p-3 gap-1 pt-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-9 rounded animate-pulse" style={{ backgroundColor: '#F3F4F6', animationDelay: `${i * 60}ms` }} />
            ))}
          </div>
        </aside>

        <main className="flex-1 p-6 lg:p-8">
          <div className="max-w-3xl">
            <div className="mb-8">
              <div className="h-3 w-12 rounded animate-pulse bg-gray-200 mb-2" />
              <div className="h-8 w-44 rounded animate-pulse bg-gray-300" />
            </div>
            <div className="bg-white border border-border divide-y divide-border">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-4 animate-pulse" style={{ animationDelay: `${i * 80}ms` }}>
                  <div className="w-9 h-9 shrink-0 rounded bg-gray-200" />
                  <div className="flex-1">
                    <div className="h-4 w-32 rounded bg-gray-200 mb-2" />
                    <div className="h-3 w-52 rounded bg-gray-100" />
                  </div>
                  <div className="h-3 w-16 rounded bg-gray-100" />
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
