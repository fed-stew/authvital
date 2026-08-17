import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `host: true` lets the dev server answer on seat.lvh.me / {tenant}.seat.lvh.me.
export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5174 },
  preview: { host: true, port: 5174 },
});
