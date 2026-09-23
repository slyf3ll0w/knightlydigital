import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Thin-shell architecture (docs/plans/mobile-app-plan.md): the native webview
 * loads the live site directly, so every web deploy updates the mobile app
 * with no store re-review. native-shell/ holds only the offline error page —
 * the app itself is never bundled.
 */
const config: CapacitorConfig = {
  appId: 'com.streamflaire.hub',
  appName: 'WorkBench',
  webDir: 'native-shell',
  server: {
    // /app/dashboard so the shell opens into the product, not the marketing
    // home; middleware redirects to /app/login when unauthenticated
    url: 'https://workbenchfsm.com/app/dashboard',
    // Required because url has a path: Capacitor otherwise treats any other
    // path (e.g. the 307 → /app/login) as external and throws it to Safari
    allowNavigation: ['workbenchfsm.com'],
    // Shown instead of the default webview error page when the site is unreachable
    errorPath: 'error.html',
  },
  // Lets the server/web code recognize the native shell by user agent
  appendUserAgent: 'StreamflaireHubShell',
  backgroundColor: '#FFFFFF',
  ios: {
    // WKWebView only enables service workers (offline snapshot cache, sw.js)
    // under App-Bound Domains: this flag + WKAppBoundDomains in Info.plist.
    // Both ship together — changing either requires a new store build.
    limitsNavigationsToAppBoundDomains: true,
  },
  plugins: {
    // App-like keyboard: the webview resizes with the keyboard instead of
    // scrolling the page like a browser (fixed bars ride above it).
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
    },
    SplashScreen: {
      backgroundColor: '#FFFFFF',
      launchShowDuration: 900,
      launchAutoHide: true,
      iosContentMode: 'scaleAspectFit',
      androidScale: 'CENTER_CROP',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    // Google + Apple sign-in inside the apps (lib/native-social-signin.ts).
    // Google refuses OAuth in an embedded webview, so the shells use the
    // system sheets and post the ID token to the "google-native" /
    // "apple-native" providers. Apple = AuthenticationServices, no SDK.
    // Facebook and Twitter stay off: they would drag
    // the Facebook and Twitter SDKs into the APK, which is dead weight and a
    // Play Data-safety declaration we would then owe for nothing.
    SocialLogin: {
      providers: { google: true, facebook: false, apple: true, twitter: false },
    },
    // App-icon badge (lib/badge.ts syncs it to the nav unread counts).
    // persist keeps the count across launches; autoClear off because the
    // count reflects server-side unreads, not "app was opened".
    Badge: {
      persist: true,
      autoClear: false,
    },
  },
};

export default config;
