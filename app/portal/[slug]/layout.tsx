import ForceLightTheme from "@/components/ForceLightTheme";

// Client-facing: the client portal always renders light on a white background,
// never the operator's/company's dark theme.
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ForceLightTheme />
      {children}
    </>
  );
}
