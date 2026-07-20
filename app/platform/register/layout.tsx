import ForceLightTheme from "@/components/ForceLightTheme";

// Onboarding is always light — never inherit the device's dark preference.
export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ForceLightTheme />
      {children}
    </>
  );
}
