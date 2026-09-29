import { defineConfig } from 'vite';

// base './' so the bundle runs from any static host or sub-path (Firebase Hosting, nginx, GitHub Pages).
export default defineConfig({
  base: './',
  build: { target: 'es2020', assetsInlineLimit: 0 },
});
