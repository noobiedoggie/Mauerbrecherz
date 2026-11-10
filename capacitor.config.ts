import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mauerbrecher.game',
  appName: 'Mauerbrecher',
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
