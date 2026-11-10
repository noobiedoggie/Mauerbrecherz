import { defineConfig } from 'vite';

// Capacitor serves the built files from the app's own origin, so every URL
// has to be relative ('./') instead of absolute ('/').
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2020',
    // three.js alone is ~700 kB minified; that is expected for a 3D game.
    chunkSizeWarningLimit: 1200,
  },
  server: { host: true },
});
