/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

/**
 * GitHub Pages serves 404.html for any unknown path, so deep links (/small-africa/admin/orders)
 * need help: 404.html turns the path into a query string and redirects to the app, and a
 * script in index.html puts the real URL back before React Router starts. Demo build only.
 */
function githubPagesSpa(base) {
  const segments = base.split('/').filter(Boolean).length;
  return {
    name: 'github-pages-spa',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'script',
        injectTo: 'head',
        children:
          "(function(l){if(l.search[1]==='/'){var d=l.search.slice(1).split('&').map(function(s){return s.replace(/~and~/g,'&')}).join('?');" +
          'window.history.replaceState(null,null,l.pathname.slice(0,-1)+d+l.hash)}}(window.location))',
      },
    ],
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: '404.html',
        source: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Small Africa</title><script>
var l=window.location,n=${segments};
l.replace(l.protocol+'//'+l.hostname+(l.port?':'+l.port:'')+l.pathname.split('/').slice(0,1+n).join('/')+'/?/'+
l.pathname.slice(1).split('/').slice(n).join('/').replace(/&/g,'~and~')+(l.search?'&'+l.search.slice(1).replace(/&/g,'~and~'):'')+l.hash);
</script></head><body></body></html>`,
      });
    },
  };
}

// Dev: /api is proxied to the PHP API on XAMPP so cookies stay same-origin.
// Demo build (`--mode demo`): static, served from GitHub Pages under /small-africa/.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.DEV_API_TARGET ?? 'http://localhost';
  const apiPath = env.DEV_API_PATH ?? '/SmallAfrica/backend/public';

  return {
    base: mode === 'demo' ? '/small-africa/' : '/',
    plugins: [react(), tailwindcss(), ...(mode === 'demo' ? [githubPagesSpa('/small-africa/')] : [])],
    resolve: {
      alias: [
        // Outside the demo build, the demo API is an empty stub: no demo code or data is shipped.
        ...(mode === 'demo' || mode === 'test'
          ? []
          : [
              {
                find: /^@\/lib\/demo$/,
                replacement: fileURLToPath(new URL('./src/lib/demo/disabled.js', import.meta.url)),
              },
            ]),
        { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      ],
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (path) => apiPath + path,
        },
      },
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            data: ['@tanstack/react-query'],
            // Only form pages (all lazy) use these, so they stay off the first load.
            forms: ['react-hook-form', 'zod', '@hookform/resolvers'],
            motion: ['gsap', 'lenis'],
          },
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.js'],
      // Only theme.css is loaded (as ?raw) so the contrast test can read the tokens.
      css: { include: [/theme\.css/] },
      restoreMocks: true,
    },
  };
});
