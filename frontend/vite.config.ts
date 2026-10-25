/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

// Dev: /api is proxied to the PHP API on XAMPP so cookies stay same-origin.
// Demo build (`--mode demo`): static, served from GitHub Pages under /small-africa/.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.DEV_API_TARGET ?? 'http://localhost';
  const apiPath = env.DEV_API_PATH ?? '/SmallAfrica/backend/public';

  return {
    base: mode === 'demo' ? '/small-africa/' : '/',
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
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
            data: ['@tanstack/react-query', 'react-hook-form', 'zod', '@hookform/resolvers'],
          },
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      restoreMocks: true,
    },
  };
});
