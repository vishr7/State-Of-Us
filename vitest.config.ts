import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Mirrors the tsconfig `paths` so tests can import API route handlers, which use them.
const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@database': fromRoot('./database'),
      '@': fromRoot('.'),
    },
  },
  test: {
    environment: 'node',
  },
});
