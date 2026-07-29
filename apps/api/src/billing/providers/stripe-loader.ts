import { createRequire } from "node:module";
import type { StripeClient, StripeConstructor } from "./stripe-sdk.types";

const requireStripe = createRequire(__filename);

/// Lazy-load Stripe SDK without adding a hard dependency.
export function loadStripe(secretKey: string, options?: { apiVersion?: string; typescript?: boolean }): StripeClient {
  const Stripe = requireStripe("stripe") as StripeConstructor;
  return new Stripe(secretKey, options);
}
