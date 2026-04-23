import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'react/index': 'src/react/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: {
    resolve: true,
  },
  splitting: true,
  clean: true,
  // Bundle @authvital/shared (don't treat as external)
  noExternal: [/^\./, /^src\//, /@authvital\/shared/],
  // External dependencies that should not be bundled
  external: ['react', 'react-dom', 'axios'],
});
