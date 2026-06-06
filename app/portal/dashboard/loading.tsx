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
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-9 rounded animate-pulse" style={{ backgroundColor: '#F3F4F6', animationDelay: `${i * 60}ms` }} />
            ))}
          </div>
        </aside>

        <main className="flex-1 p-6 lg:p-8">
          <div className="max-w-5xl">
            <div className="mb-8">
              <div className="h-3 w-24 rounded animate-pulse bg-gray-200 mb-2" />
              <div className="h-8 w-48 rounded animate-pulse bg-gray-300" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-white border border-border p-6 animate-pulse" style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="h-8 w-12 rounded bg-gray-200 mb-2" />
                  <div className="h-3 w-24 rounded bg-gray-100" />
                </div>
              ))}
            </div>
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="bg-white border border-border h-48 animate-pulse" />
              <div className="flex flex-col gap-4">
                <div className="bg-white border border-border h-20 animate-pulse" />
                <div className="h-24 animate-pulse" style={{ backgroundColor: '#0C0F0C' }} />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
