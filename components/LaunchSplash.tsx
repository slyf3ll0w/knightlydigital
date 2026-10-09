import { headers } from "next/headers";
import { isNativeShellUserAgent } from "@/lib/sign-in-options";
import { LaunchSplashArt } from "@/components/LaunchSplashArt";

/**
 * Launch animation for the native shell: a blue-and-orange splash that
 * gathers into the WorkBench mark, then lifts away to reveal the app
 * (styles: `.wb-launch` in app/globals.css).
 *
 * Why it lives on the web and not in the app binary: iOS launch screens are
 * static by design, and the shell is thin — the webview loads the live site —
 * so the moving part has to be a page. The native splash shows its still
 * frame first; the overlay here is server-rendered so it is on screen at
 * first paint, and the inline script asks the Capacitor SplashScreen plugin
 * to hide the moment the overlay has painted (a no-op in shells built with
 * launchAutoHide, which hide on their own).
 *
 * Plays on a COLD launch only — the inline script keys on sessionStorage,
 * which a WKWebView keeps for the life of the app process. It runs before
 * React hydrates and only flips a data attribute (never removes the node),
 * so hydration finds the tree it expects; suppressHydrationWarning covers
 * the attribute. Desktop browsers never get the markup at all (the server
 * checks the shell user agent) — the design gallery has a replay.
 */
const GATE_SCRIPT = `(function(){try{
var el=document.getElementById("wb-launch");if(!el)return;
var ss=null;try{ss=window.sessionStorage}catch(e){}
if(ss&&ss.getItem("wb-launched"))return;
try{ss&&ss.setItem("wb-launched","1")}catch(e){}
el.dataset.play="1";
function done(){el.dataset.play="done"}
el.addEventListener("animationend",function(e){if(e.target===el)done()});
setTimeout(done,3000);
requestAnimationFrame(function(){requestAnimationFrame(function(){
try{var C=window.Capacitor,S=C&&C.Plugins&&C.Plugins.SplashScreen;if(S&&S.hide){S.hide({fadeOutDuration:0}).catch(function(){})}}catch(e){}
})});
}catch(e){}})();`;

export default async function LaunchSplash() {
  const ua = (await headers()).get("user-agent");
  if (!isNativeShellUserAgent(ua)) return null;
  return (
    <>
      <LaunchSplashArt id="wb-launch" />
      <script dangerouslySetInnerHTML={{ __html: GATE_SCRIPT }} />
    </>
  );
}
