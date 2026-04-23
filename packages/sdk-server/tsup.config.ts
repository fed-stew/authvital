import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'session/index': 'src/session/index.ts',
    'middleware/index': 'src/middleware/index.ts',
    'client/index': 'src/client/index.ts',
    'crypto/index': 'src/crypto/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: {
    resolve: true,
  },
  splitting: true,
  clean: true,
  noExternal: [/^\./, /^src\//, /@authvital\/shared/],
});
