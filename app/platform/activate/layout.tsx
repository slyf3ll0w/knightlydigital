import ForceLightTheme from "@/components/ForceLightTheme";

// The activation gate renders standalone like the auth screens — always light.
export default function ActivateLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ForceLightTheme />
      {children}
    </>
  );
}
