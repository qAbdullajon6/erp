// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // Nitro defaults to a Cloudflare Workers bundle, which will not start under
  // Node on a VPS — `node .output/server/index.mjs` needs the node-server
  // preset. Override with NITRO_PRESET if this is ever deployed elsewhere.
  nitro: {
    preset: process.env.NITRO_PRESET ?? "node-server",
  },
  vite: {
    server: {
      port: 3000,
      host: true,
      strictPort: false,
      proxy: {
        // Note the rewrite: the API mounts its routes at the root (/orders,
        // /auth/login), not under /api. Any reverse proxy in front of a
        // production deployment has to strip the prefix the same way, or every
        // call 404s.
        '/api': {
          target: 'http://localhost:4000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
