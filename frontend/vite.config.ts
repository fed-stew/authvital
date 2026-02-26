import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Backend runs on this port
const BACKEND_URL = 'http://localhost:3002';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 8000,
    host: '0.0.0.0', // Bind to all interfaces so Docker can reach us
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
