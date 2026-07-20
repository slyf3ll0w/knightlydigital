import ForceLightTheme from "@/components/ForceLightTheme";

// Client-facing: contracts/agreements always render light on a white
// background, never the operator's/company's dark theme.
export default function ContractLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ForceLightTheme />
      {children}
    </>
  );
}
