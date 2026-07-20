import ForceLightTheme from "@/components/ForceLightTheme";

// Client-facing: the embeddable booking form always renders light on a white
// background, never the operator's/company's dark theme.
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ForceLightTheme />
      {children}
    </>
  );
}
