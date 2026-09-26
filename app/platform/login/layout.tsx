import ForceLightTheme from "@/components/ForceLightTheme";

// Auth screens are always light — never inherit the device's dark preference.
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ForceLightTheme />
      {/* Outside the AppShell (signed out): .ds switches on Lexend + the design tokens */}
      <div className="ds">{children}</div>
    </>
  );
}
