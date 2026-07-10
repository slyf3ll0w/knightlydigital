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
    url: 'https://streamflaire.com',
    // Shown instead of the default webview error page when the site is unreachable
    errorPath: 'error.html',
  },
  // Lets the server/web code recognize the native shell by user agent
  appendUserAgent: 'StreamflaireHubShell',
  backgroundColor: '#0C0F0C',
  plugins: {
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
