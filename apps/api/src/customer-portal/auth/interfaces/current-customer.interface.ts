/// What's attached to `request.user` after CustomerJwtAuthGuard runs —
/// always freshly derived from the database (see CustomerJwtStrategy), never
/// taken verbatim from the token's claims beyond `sub`/`cid`.
export interface CurrentCustomerPayload {
  accountId: string;
  customerId: string;
  organizationId: string;
  email: string;
  companyName: string;
}
