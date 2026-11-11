import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Kept from the first version so new APKs update the installed app (and keep the save).
  appId: 'com.mauerbrecher.game',
  appName: 'Berlirunner',
  webDir: 'dist',
  backgroundColor: '#F1EDE4',
  android: {
    backgroundColor: '#F1EDE4',
  },
  plugins: {
    // Edge-to-edge web view; the CSS reads --safe-area-inset-* for notches.
    SystemBars: {
      insetsHandling: 'css',
      hidden: true,
    },
  },
};

export default config;
