import ForceLightTheme from "@/components/ForceLightTheme";

/**
 * The Help Center is always light, like the marketing site it's styled
 * after, even when the app is in dark mode. (/app/help is also in the
 * pre-paint light list in app/layout.tsx, so full loads never flash dark.)
 */
export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ForceLightTheme />
      {children}
    </>
  );
}
