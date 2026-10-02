import ForceLightTheme from "@/components/ForceLightTheme";
import SlugRedirect from "@/components/SlugRedirect";

// Client-facing: the online booking page always renders light on a white
// background, never the operator's/company's dark theme.
export default async function BookLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <>
      <ForceLightTheme />
      <SlugRedirect slug={slug} prefix="book" />
      {children}
    </>
  );
}
