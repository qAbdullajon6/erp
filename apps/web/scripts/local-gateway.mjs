#!/usr/bin/env node
/**
 * Local gateway: serves the Nitro production build and proxies /api → API.
 * Used instead of `vite dev` when browsing over a remote tunnel (fewer
 * round-trips = much faster page loads).
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const GATEWAY_PORT = Number(process.env.PORT ?? 3000);
const WEB_PORT = Number(process.env.WEB_INTERNAL_PORT ?? 3001);
const API_TARGET = process.env.API_URL ?? "http://127.0.0.1:4000";
const WEB_TARGET = `http://127.0.0.1:${WEB_PORT}`;

const root = path.dirname(fileURLToPath(import.meta.url));
const nitroEntry = path.join(root, "../.output/server/index.mjs");

const nitro = spawn(process.execPath, [nitroEntry], {
  cwd: path.join(root, ".."),
  env: { ...process.env, PORT: String(WEB_PORT), NITRO_PORT: String(WEB_PORT), HOST: "127.0.0.1" },
  stdio: ["ignore", "inherit", "inherit"],
});

function proxy(req, res, target) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const dest = new URL(url.pathname + url.search, target);
  if (target === API_TARGET) {
    dest.pathname = dest.pathname.replace(/^\/api/, "") || "/";
  }

  const headers = { ...req.headers, host: dest.host };
  const upstream = http.request(
    dest,
    { method: req.method, headers },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", (err) => {
    res.writeHead(502, { "content-type": "text/plain" });
    res.end(`Bad gateway: ${err.message}`);
  });
  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  const isApi = (req.url ?? "").startsWith("/api");
  proxy(req, res, isApi ? API_TARGET : WEB_TARGET);
});

server.listen(GATEWAY_PORT, "0.0.0.0", () => {
  console.log(`[local-gateway] http://0.0.0.0:${GATEWAY_PORT} → web:${WEB_PORT} api:${API_TARGET}`);
});

function shutdown() {
  nitro.kill("SIGTERM");
  server.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
nitro.on("exit", (code) => {
  console.error(`[local-gateway] nitro exited (${code})`);
  process.exit(code ?? 1);
});
