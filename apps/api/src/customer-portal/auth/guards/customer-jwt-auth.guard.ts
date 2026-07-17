import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/// Guards every customer-portal endpoint that requires a signed-in customer.
/// Reuses the passport "customer-jwt" strategy; on success `request.user`
/// holds a CurrentCustomerPayload.
@Injectable()
export class CustomerJwtAuthGuard extends AuthGuard("customer-jwt") {}
