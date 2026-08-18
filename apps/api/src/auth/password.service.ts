import { Injectable } from "@nestjs/common";
import * as argon2 from "argon2";

/// Fixed hash used only to equalize verification cost for unknown accounts.
export const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$+GJNCAmn3nE5tlkWjZ6tqQ$ktwl4Qpd4YFzcL1U/VfHqEmR7cV4DNQ+VAC3iB/fa5s";

/// The only place password hashing happens. No other module should call
/// argon2 directly — go through this service so the hashing strategy can
/// change in one place later if needed. Uses argon2id (the variant argon2's
/// default recommends). Costs are pinned so a dependency update cannot
/// silently weaken hashes or desynchronize login's fixed dummy hash.
@Injectable()
export class PasswordService {
  async hash(plainTextPassword: string): Promise<string> {
    return argon2.hash(plainTextPassword, {
      type: argon2.argon2id,
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 4,
    });
  }

  async verify(plainTextPassword: string, passwordHash: string): Promise<boolean> {
    return argon2.verify(passwordHash, plainTextPassword);
  }
}
