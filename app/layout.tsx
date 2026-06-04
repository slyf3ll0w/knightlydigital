import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
import { MarketingWrapper } from "@/components/MarketingWrapper";
import { SessionProviderWrapper } from "@/components/SessionProviderWrapper";

export const metadata: Metadata = {
  title: {
    default: "Streamflare Media Group | Allen, TX",
    template: "%s | Streamflare Media Group",
  },
  description:
    "Streamflare Media Group delivers precision digital marketing, custom software, and social media management for growth-minded businesses across the DFW Metroplex.",
  metadataBase: new URL("https://streamflaremedia.com"),
  icons: {
    icon: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#0C0F0C" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Oxanium:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <SessionProviderWrapper>
          <MarketingWrapper>{children}</MarketingWrapper>
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
