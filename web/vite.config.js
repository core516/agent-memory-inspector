import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build emits to ../web/dist which the zero-dep server hosts.
// Dev proxies /api to the local Node server on :4317.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:4317',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
