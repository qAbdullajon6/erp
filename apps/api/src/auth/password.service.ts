import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

/// The only place password hashing happens. No other module should call
/// bcryptjs directly — go through this service so the hashing strategy can
/// change in one place later if needed.
@Injectable()
export class PasswordService {
  async hash(plainTextPassword: string): Promise<string> {
    return bcrypt.hash(plainTextPassword, SALT_ROUNDS);
  }

  async verify(plainTextPassword: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(plainTextPassword, passwordHash);
  }
}
