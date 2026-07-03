import { Module } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { PasswordService } from "./password.service";

/// Preparation only for this phase: no controller, no HTTP routes, no JWT
/// module registered yet. Exports PasswordService/AuthService so the next
/// auth phase can build real endpoints on top of them without moving files.
@Module({
  providers: [PasswordService, AuthService],
  exports: [PasswordService, AuthService],
})
export class AuthModule {}
