import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Client Portal | Streamflaire Media Group",
    template: "%s | Client Portal",
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

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
