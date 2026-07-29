import type { StripePaymentError } from "./stripe-sdk.types";

export function isStripePaymentError(error: unknown): error is StripePaymentError {
  return (
    typeof error === "object" &&
    error !== null &&
    ("type" in error || "code" in error || "message" in error)
  );
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (isStripePaymentError(error) && typeof error.message === "string") {
    return error.message;
  }
  return "Unknown error";
}
