import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * The app's logic is mostly in components, but not all of it — the canvas
 * packing decides where every panel lands and fails quietly when it's wrong.
 * Node environment only: these are pure functions, not rendered trees.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
