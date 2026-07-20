import ForceLightTheme from "@/components/ForceLightTheme";

// Client-facing: quotes always render light on a white background, never the
// operator's/company's dark theme.
export default function QuoteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ForceLightTheme />
      {children}
    </>
  );
}
