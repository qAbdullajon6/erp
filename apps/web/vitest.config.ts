import path from 'node:path';
import { defineConfig } from 'vitest/config';

/// Unit tests for the React Query layer (Task 8.9).
///
/// Node environment, no DOM: what is under test is cache behaviour — which keys a
/// mutation invalidates, whether a second read hits the cache — and a QueryClient
/// needs no browser to answer that. Rendering components would only add a jsdom
/// dependency and a source of flake without testing anything more.
export default defineConfig({
  // These tests never touch a stylesheet. Without this, Vite goes looking for the
  // app's PostCSS/Tailwind pipeline and dies on a plugin it does not need.
  css: { postcss: {} },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
