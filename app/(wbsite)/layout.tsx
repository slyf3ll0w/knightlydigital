import type { Metadata } from "next";
import WBNav from "@/components/wb/WBNav";
import WBFooter from "@/components/wb/WBFooter";

// Escape the agency-site "| Streamflaire Media Group" title template
export const metadata: Metadata = {
  title: { template: "%s", default: "WorkBench" },
};

/**
 * WorkBench marketing site shell (/wb, /pricing, /apply). These pages move
 * to the site root when workbenchfsm.com takes over this app.
 */
export default function WBSiteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="wb-site min-h-screen bg-[#FAFBFD] text-gray-900">
      <WBNav />
      <main>{children}</main>
      <WBFooter />
    </div>
  );
}
