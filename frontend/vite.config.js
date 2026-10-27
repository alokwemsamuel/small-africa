/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

// Dev: /api is proxied to the PHP API on XAMPP so cookies stay same-origin.
// Demo build (`--mode demo`): static, served from GitHub Pages under /small-africa/.
// Builds are followed by scripts/prerender.mjs, which pre-builds the public pages as HTML.
export default defineConfig(({ mode, isSsrBuild }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.DEV_API_TARGET ?? 'http://localhost';
  const apiPath = env.DEV_API_PATH ?? '/SmallAfrica/backend/public';

  return {
    base: mode === 'demo' ? '/small-africa/' : '/',
    plugins: [react(), tailwindcss()],
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
      // Fonts stay real files: the production CSP (font-src 'self') blocks data: URLs.
      assetsInlineLimit: (file) => (/\.woff2?$/.test(file) ? false : undefined),
      // Chunks for the browser build only (the server build for pre-rendering keeps packages external).
      rollupOptions: isSsrBuild
        ? {}
        : {
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
