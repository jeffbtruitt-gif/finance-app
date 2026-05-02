import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// GitHub Pages serves the app from /finance-app/ — that's why `base` is set.
// In dev (npm run dev), `base` is ignored and the app runs at /.
export default defineConfig({
  plugins: [react()],
  base: '/finance-app/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
});
