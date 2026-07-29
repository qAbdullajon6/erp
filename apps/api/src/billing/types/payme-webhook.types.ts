import type { Prisma } from "@prisma/client";

export class PaymeRpcError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = "PaymeRpcError";
    this.code = code;
  }
}

export function isPaymeRpcError(error: unknown): error is PaymeRpcError {
  return error instanceof PaymeRpcError;
}

export interface PaymeAccountParams {
  order_id?: string;
}

export interface PaymeCheckPerformParams {
  amount: number;
  account?: PaymeAccountParams;
}

export interface PaymeCreateTransactionParams {
  id: string;
  account?: PaymeAccountParams;
}

export interface PaymePerformTransactionParams {
  id: string;
}

export interface PaymeCancelTransactionParams {
  id: string;
  reason?: number;
}

export type PaymeWebhookParams =
  | PaymeCheckPerformParams
  | PaymeCreateTransactionParams
  | PaymePerformTransactionParams
  | PaymeCancelTransactionParams;

export interface PaymeRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: PaymeWebhookParams;
}

export interface PaymeRpcSuccessResponse {
  jsonrpc: "2.0";
  id: number;
  result: PaymeWebhookResult;
}

export interface PaymeRpcErrorResponse {
  jsonrpc: "2.0";
  id: number;
  error: {
    code: number;
    message: string;
  };
}

export type PaymeRpcResponseBody = PaymeRpcSuccessResponse | PaymeRpcErrorResponse;

export interface PaymeCheckPerformResult {
  allow: boolean;
}

export interface PaymeCreateTransactionResult {
  transaction: string;
  state: number;
  create_time: number;
}

export interface PaymePerformTransactionResult {
  transaction: string;
  state: number;
  perform_time: number;
}

export interface PaymeCancelTransactionResult {
  transaction: string;
  state: number;
  cancel_time: number;
}

export type PaymeWebhookResult =
  | PaymeCheckPerformResult
  | PaymeCreateTransactionResult
  | PaymePerformTransactionResult
  | PaymeCancelTransactionResult;

export interface PaymeStoredTransactionPayload {
  account?: PaymeAccountParams;
  amount?: number;
}

export function parsePaymeStoredPayload(payload: Prisma.JsonValue): PaymeStoredTransactionPayload {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return {};
  }
  const record = payload as Record<string, unknown>;
  const accountRaw = record.account;
  let account: PaymeAccountParams | undefined;
  if (typeof accountRaw === "object" && accountRaw !== null && !Array.isArray(accountRaw)) {
    const accountRecord = accountRaw as Record<string, unknown>;
    account = {
      order_id: typeof accountRecord.order_id === "string" ? accountRecord.order_id : undefined,
    };
  }
  return {
    account,
    amount: typeof record.amount === "number" ? record.amount : undefined,
  };
}
