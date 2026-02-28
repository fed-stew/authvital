import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    server: 'src/server.ts',
  },
  format: ['cjs', 'esm'],
  dts: {
    // Bundle types from @authvital/shared into the SDK's .d.ts files
    resolve: true,
  },
  splitting: true,
  clean: true,
  // Bundle @authvital/shared (don't treat as external)
  noExternal: [/^\./, /^src\//, /@authvital\/shared/],
});
