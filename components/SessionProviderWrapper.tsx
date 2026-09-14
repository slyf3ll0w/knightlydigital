"use client";

import { SessionProvider } from "next-auth/react";

export function SessionProviderWrapper({ children }: { children: React.ReactNode }) {
  // refetchOnWindowFocus off: the default re-fetches /api/auth/session every
  // time the app returns to the foreground — a wasted round trip on phones
  // (middleware re-validates the JWT on every server request anyway).
  return <SessionProvider refetchOnWindowFocus={false}>{children}</SessionProvider>;
}
