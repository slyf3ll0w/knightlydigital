import ForceLightTheme from "@/components/ForceLightTheme";

// Client-facing: the payment page always renders light on a white background,
// never the operator's/company's dark theme.
export default function PayLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ForceLightTheme />
      {children}
    </>
  );
}
