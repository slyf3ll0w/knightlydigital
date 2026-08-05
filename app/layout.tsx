import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // iOS: stops the automatic page zoom when focusing inputs (pinch zoom
  // still works — Safari ignores this for user gestures since iOS 10)
  maximumScale: 1,
  viewportFit: "cover",
  // Keyboard shrinks the layout instead of scrolling over it (Android/Chrome)
  interactiveWidget: "resizes-content",
};
import { SessionProviderWrapper } from "@/components/SessionProviderWrapper";

export const metadata: Metadata = {
  title: {
    default: "WorkBench",
    template: "%s — WorkBench",
  },
  description:
    "WorkBench is field service management for home-service teams: scheduling, quotes, invoices, online booking, client hub, team chat, and built-in payments. Free to use.",
  metadataBase: new URL("https://workbenchfsm.com"),
  icons: {
    icon: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning: the theme stamp below adds data-mode to <html>
    // before hydration; without this React 19 flags the mismatch (#418) and
    // "repairs" the element — wiping data-mode and kicking the app back to
    // light theme. Attribute-level suppression, children still validated.
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#0A1428" />
        {/* Theme stamp — runs before paint so there's no light/dark flash.
            data-mode on <html> drives every dark-theme rule in globals.css;
            "hub-theme" in localStorage ("light" | "dark" | "system") is the
            per-device choice from Settings → Appearance. The app is LIGHT
            unless the user explicitly chose Dark or Automatic — following the
            device theme by default made the app flip to dark mid-session on
            phones set to system dark, which read as a bug.

            Onboarding and client-facing routes are pinned to light regardless
            of device/system/localStorage — they must never inherit dark mode
            (kept in sync with the ForceLightTheme component, which also covers
            client-side navigation into these pages).

            The MutationObserver guards the stamp: hydration mismatches
            elsewhere in the tree make React 19 regenerate and re-render
            <html> WITHOUT data-mode (suppressHydrationWarning only silences
            the attribute diff), which wiped the chosen theme on some page
            loads — if anything removes the attribute, re-apply it. apply()
            always sets data-mode, so the observer never loops. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
var m=window.matchMedia("(prefers-color-scheme: dark)");
var L=["/quote","/pay","/portal","/contract","/hub","/book","/embed","/app/register","/app/login","/app/forgot-password","/app/reset-password","/app/activate","/superadmin/login"];
function forcedLight(){var p=location.pathname;for(var i=0;i<L.length;i++){if(p===L[i]||p.indexOf(L[i]+"/")===0)return true;}return false;}
function apply(){var t=null;try{t=localStorage.getItem("hub-theme")}catch(e){}
document.documentElement.dataset.mode=(!forcedLight()&&(t==="dark"||(t==="system"&&m.matches)))?"dark":"light";}
apply();m.addEventListener("change",apply);window.applyHubTheme=apply;
new MutationObserver(function(){if(!document.documentElement.dataset.mode)apply();}).observe(document.documentElement,{attributes:true,attributeFilter:["data-mode"]});
}catch(e){}})();`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Oxanium:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&family=Nunito:wght@800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <SessionProviderWrapper>{children}</SessionProviderWrapper>
      </body>
    </html>
  );
}
