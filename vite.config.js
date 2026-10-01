import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The build is ONE self-contained index.html (JS, CSS, sql.js wasm and map data inlined), so it runs from
// GitHub Pages, Firebase, nginx or a double-click. The dev entry is app.html; the bundle is emitted as index.html.
const renameEntry = () => ({
  name: 'rename-entry',
  enforce: 'post',
  generateBundle(_, bundle) {
    const f = bundle['app.html'];
    if (f) { f.fileName = 'index.html'; bundle['index.html'] = f; delete bundle['app.html']; }
  },
});

export default defineConfig({
  base: './',
  plugins: [viteSingleFile({ removeViteModuleLoader: true }), renameEntry()],
  server: { open: '/app.html' },
  build: { target: 'es2020', assetsInlineLimit: 100000000, rollupOptions: { input: 'app.html' } },
});
