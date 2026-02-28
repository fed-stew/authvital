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
