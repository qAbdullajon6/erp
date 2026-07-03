import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";

/// The only place password hashing happens. No other module should call
/// argon2 directly — go through this service so the hashing strategy can
/// change in one place later if needed. Uses argon2id (the variant argon2's
/// default recommends) with the library's default cost parameters, which
/// are tuned to be safe for a general web-auth use case.
@Injectable()
export class PasswordService {
  async hash(plainTextPassword: string): Promise<string> {
    return argon2.hash(plainTextPassword, { type: argon2.argon2id });
  }

  async verify(plainTextPassword: string, passwordHash: string): Promise<boolean> {
    return argon2.verify(passwordHash, plainTextPassword);
  }
}
