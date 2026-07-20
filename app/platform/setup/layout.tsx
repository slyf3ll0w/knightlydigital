import ForceLightTheme from "@/components/ForceLightTheme";

// The setup wizard is onboarding — always light, regardless of the operator's
// device/system dark preference. Restores the device theme on leave.
export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ForceLightTheme />
      {children}
    </>
  );
}
