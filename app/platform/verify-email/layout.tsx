import ForceLightTheme from "@/components/ForceLightTheme";

// Auth screens are always light — never inherit the device's dark preference.
export default function VerifyEmailLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ForceLightTheme />
      {children}
    </>
  );
}
