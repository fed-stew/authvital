import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Lightweight Vite config. `host: true` lets the dev server answer on
// app.lvh.me / {tenant}.app.lvh.me during local development.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 5173,
  },
});
