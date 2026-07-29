export interface ClickWebhookPayload {
  click_trans_id: number;
  service_id: number;
  merchant_trans_id: string;
  amount: number;
  action: number;
  sign_time: string;
  sign_string: string;
}

export interface ClickApiResponse {
  error_code: number;
  error_note?: string;
  invoice_id?: number;
  click_trans_id?: number;
}
