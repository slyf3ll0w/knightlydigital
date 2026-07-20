import ForceLightTheme from "@/components/ForceLightTheme";

// Client-facing: the online booking page always renders light on a white
// background, never the operator's/company's dark theme.
export default function BookLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ForceLightTheme />
      {children}
    </>
  );
}
