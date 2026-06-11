'use client';

import { usePathname } from 'next/navigation';
import { Header } from './Header';
import { Footer } from './Footer';

export function MarketingWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // App + all client-facing pages (hub, quote approval, payment, booking,
  // embeds) render without the marketing site chrome
  const bare = ['/app', '/portal', '/admin', '/hub', '/quote', '/pay', '/book', '/embed'];
  if (bare.some((p) => pathname.startsWith(p))) return <>{children}</>;

  return (
    <>
      <Header />
      <main>{children}</main>
      <Footer />
    </>
  );
}
