/// The JWT payload for customer-portal sessions. `sub` is the portal account
/// id and `cid` is the customer id; both are re-validated on every request by
/// CustomerJwtStrategy (account/customer/org must still be ACTIVE), so a
/// revoked or suspended account stops working the moment its access token
/// is next checked, even if the token itself is still cryptographically valid.
export interface CustomerJwtPayload {
  sub: string;
  cid: string;
}
