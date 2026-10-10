import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@ai-slot/registry': fileURLToPath(new URL('../registry/src/index.ts', import.meta.url)),
    },
  },
  test: { environment: 'node' },
});
