// Per-module "Connected Mode" switch. Defaults to "demo" (current
// localStorage behavior, unchanged) everywhere — only becomes "api" when
// NEXT_PUBLIC_DATA_MODE is explicitly set to "api" in the environment. The
// production Vercel deployment never sets this, so it always resolves to
// "demo" there. See docs/CUSTOMERS_API.md.
export type DataMode = "demo" | "api";

export function getDataMode(): DataMode {
  return process.env.NEXT_PUBLIC_DATA_MODE === "api" ? "api" : "demo";
}
