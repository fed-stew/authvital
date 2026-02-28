import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    server: 'src/server.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: true,
  clean: true,
  // Ensure all source files are included (not treated as external)
  // This is critical for bundling ./sync and ./webhooks properly
  noExternal: [/^\./, /^src\//],
});
