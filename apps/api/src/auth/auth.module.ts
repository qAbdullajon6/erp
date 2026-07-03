import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { PasswordService } from "./password.service";
import { JwtStrategy } from "./strategies/jwt.strategy";
import type { AuthConfig } from "../config/configuration";

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const authConfig = configService.get<AuthConfig>("auth")!;
        return {
          secret: authConfig.jwtAccessSecret,
          signOptions: { expiresIn: authConfig.jwtAccessExpiresInSeconds },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [PasswordService, AuthService, JwtStrategy],
  exports: [PasswordService, AuthService],
})
export class AuthModule {}
