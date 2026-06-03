import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Client Portal | Streamflare Media Group",
    template: "%s | Client Portal",
  },
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
