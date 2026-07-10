import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Thin-shell architecture (docs/plans/mobile-app-plan.md): the native webview
 * loads the live site directly, so every web deploy updates the mobile app
 * with no store re-review. native-shell/ holds only the offline error page —
 * the app itself is never bundled.
 */
const config: CapacitorConfig = {
  appId: 'com.streamflaire.hub',
  appName: 'Streamflaire Hub',
  webDir: 'native-shell',
  server: {
    // /app/dashboard so the shell opens into the product, not the marketing
    // home; middleware redirects to /app/login when unauthenticated
    url: 'https://streamflaire.com/app/dashboard',
    // Required because url has a path: Capacitor otherwise treats any other
    // path (e.g. the 307 → /app/login) as external and throws it to Safari
    allowNavigation: ['streamflaire.com'],
    // Shown instead of the default webview error page when the site is unreachable
    errorPath: 'error.html',
  },
  // Lets the server/web code recognize the native shell by user agent
  appendUserAgent: 'StreamflaireHubShell',
  backgroundColor: '#0C0F0C',
  plugins: {
    // App-like keyboard: the webview resizes with the keyboard instead of
    // scrolling the page like a browser (fixed bars ride above it).
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
    },
    SplashScreen: {
      backgroundColor: '#0C0F0C',
      launchShowDuration: 900,
      launchAutoHide: true,
      androidScale: 'CENTER_CROP',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
