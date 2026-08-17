import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Backend runs on 8000 (same as Docker)
const BACKEND_URL = 'http://localhost:8000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // The largest remaining chunk is the lazy-loaded admin console
    // (~650 kB min / ~75 kB gzip) — it is only downloaded by super admins
    // after navigating to /admin, never by end users on the auth hot path.
    // Splitting it further would fragment cohesive console code for no
    // real-world win, so the warning threshold is raised to 800 kB instead
    // of Vite's 500 kB default. Keep every chunk below this.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Split the biggest vendor groups out of the entry chunk. Route-level
        // code splitting (React.lazy in App.tsx) handles the app code; this
        // keeps the remaining entry (auth pages + glue) under Vite's 500 kB
        // warning threshold without arbitrary micro-chunks.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'data-vendor': ['@tanstack/react-query', '@ts-rest/react-query', 'axios'],
          'ui-vendor': ['lucide-react'],
        },
      },
    },
  },
  server: {
    port: 5173, // Vite default - access frontend here during dev
    host: '0.0.0.0',
    strictPort: true,
    // Proxy API requests to backend
    proxy: {
      '/api': {
        target: BACKEND_URL,
        changeOrigin: true,
      },
      '/oauth': {
        target: BACKEND_URL,
        changeOrigin: true,
      },
      '/.well-known': {
        target: BACKEND_URL,
        changeOrigin: true,
      },
    },
  },
});
