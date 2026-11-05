import type { Metadata } from "next";
import WBFreeSoftwarePage from "@/components/wb/WBFreeSoftwarePage";
import { freePageByPath } from "@/lib/wb-free-pages";

const page = freePageByPath("/free-scheduling-software")!;

export const metadata: Metadata = {
  title: page.title,
  description: page.description,
  alternates: { canonical: `https://workbenchfsm.com${page.path}` },
};

export default function FreeSchedulingPage() {
  return <WBFreeSoftwarePage page={page} />;
}
