import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "../prisma/prisma.module";
import { MailModule } from "../mail/mail.module";
import { AuthModule } from "../auth/auth.module";
import { InvitationController } from "./invitation.controller";
import { PublicInvitationController } from "./public-invitation.controller";
import { InvitationService } from "./invitation.service";

/// Wires the invitation service and its admin HTTP surface. PrismaModule,
/// MailModule and ConfigModule are global already, but are listed explicitly so
/// this module's dependencies are self-documenting. AuthModule is imported to
/// reuse its exported PasswordService (argon2id) for accepting invitations —
/// never AuthService.
@Module({
  imports: [PrismaModule, MailModule, ConfigModule, AuthModule],
  controllers: [InvitationController, PublicInvitationController],
  providers: [InvitationService],
  exports: [InvitationService],
})
export class InvitationModule {}
