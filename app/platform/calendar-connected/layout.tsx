import ForceLightTheme from "@/components/ForceLightTheme";

// Opened in the system browser, outside the app shell — always light.
export default function CalendarConnectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ForceLightTheme />
      {children}
    </>
  );
}
