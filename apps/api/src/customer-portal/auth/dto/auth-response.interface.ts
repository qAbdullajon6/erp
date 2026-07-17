/// The customer-facing shape returned by login/refresh — never the account
/// id, password hash, or any internal identifier beyond the customer's own id.
export interface CustomerPortalCustomerPayload {
  id: string;
  companyName: string;
  contactName: string | null;
  email: string;
}

export interface CustomerAuthResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
  customer: CustomerPortalCustomerPayload;
}
