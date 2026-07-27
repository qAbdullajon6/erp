// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // Nitro's default here is a Cloudflare Workers bundle, which starts neither
  // on Vercel nor under Node on a VPS. Two targets, picked automatically:
  //
  //   Vercel  `vercel` preset -> .vercel/output (Build Output API v3). Vercel
  //           detects that directory itself, which is why the project's "Output
  //           Directory" setting must stay empty — pointing it at `build` is
  //           what produced "No Output Directory named build found".
  //   VPS     `node-server` -> .output/server/index.mjs, started by Node in the
  //           web container. Also what `npm run build:web` gives locally.
  //
  // NITRO_PRESET overrides both.
  nitro: {
    preset: process.env.NITRO_PRESET ?? (process.env.VERCEL ? "vercel" : "node-server"),
  },
  vite: {
    server: {
      port: 3000,
      host: true,
      strictPort: false,
      // Pre-transform hot routes so first navigation after boot is not a
      // multi-second cold compile (especially painful over remote tunnels).
      warmup: {
        clientFiles: [
          './src/routes/__root.tsx',
          './src/routes/auth.sign-in.tsx',
          './src/routes/platform.tsx',
          './src/routes/platform.index.tsx',
          './src/routes/platform.organizations.index.tsx',
          './src/routes/platform.leads.index.tsx',
          './src/routes/app.tsx',
          './src/components/platform/**/*.{ts,tsx}',
          './src/components/layout/**/*.{ts,tsx}',
          './src/lib/api/auth.ts',
          './src/lib/api/platform.ts',
        ],
      },
      proxy: {
        // Note the rewrite: the API mounts its routes at the root (/orders,
        // /auth/login), not under /api. Any reverse proxy in front of a
        // production deployment has to strip the prefix the same way, or every
        // call 404s.
        '/api': {
          // 127.0.0.1 avoids macOS/Linux "localhost" → IPv6 (::1) mismatches
          // when the API is only bound / reachable on IPv4.
          target: 'http://127.0.0.1:4000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
    // Same /api proxy for `vite preview` (production build locally) — without
    // this, preview pages load fast but every login/fetch fails.
    preview: {
      port: 3000,
      host: true,
      strictPort: false,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:4000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        '@tanstack/react-router',
        '@tanstack/react-query',
        '@tanstack/react-query-devtools',
        'lucide-react',
        'sonner',
        'clsx',
        'tailwind-merge',
        'class-variance-authority',
        'zod',
        'date-fns',
        'cmdk',
        'vaul',
        '@radix-ui/react-dialog',
        '@radix-ui/react-dropdown-menu',
        '@radix-ui/react-select',
        '@radix-ui/react-tabs',
        '@radix-ui/react-tooltip',
        '@radix-ui/react-slot',
        '@radix-ui/react-label',
        '@radix-ui/react-separator',
        '@radix-ui/react-avatar',
        '@radix-ui/react-checkbox',
        '@radix-ui/react-switch',
        '@radix-ui/react-popover',
        '@radix-ui/react-scroll-area',
        '@radix-ui/react-collapsible',
      ],
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
