import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Admin | Streamflaire Media Group",
    template: "%s | Admin",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Streamflaire",
  },
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
