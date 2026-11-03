import ForceLightTheme from "@/components/ForceLightTheme";

// The payment-setup step renders standalone like the auth screens — always light.
export default function SetupPaymentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ForceLightTheme />
      {children}
    </>
  );
}
