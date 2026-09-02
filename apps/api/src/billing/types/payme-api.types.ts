export interface PaymeRpcErrorBody {
  code: number;
  message: string;
}

export interface PaymeCreateTransactionResult {
  transaction: string;
}

export interface PaymePerformTransactionResult {
  perform_time: number;
}

export interface PaymeCancelTransactionResult {
  transaction: string;
  cancel_time: number;
}

export type PaymeRpcResponse<T> =
  | { error?: PaymeRpcErrorBody; result?: T }
  | { error: PaymeRpcErrorBody; result?: undefined }
  | { error?: undefined; result: T };
