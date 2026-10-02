import ForceLightTheme from "@/components/ForceLightTheme";
import SlugRedirect from "@/components/SlugRedirect";

// Client-facing: the embeddable booking form always renders light on a white
// background, never the operator's/company's dark theme.
export default async function EmbedLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <>
      <ForceLightTheme />
      <SlugRedirect slug={slug} prefix="embed" />
      {children}
    </>
  );
}
