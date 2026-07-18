import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppConfig, InvitationConfig } from "../config/configuration";
import { MailService } from "./mail.service";
import { MailOutbox } from "./mail.outbox";
import { createMailService } from "./mail.factory";

/// Global for the same reason AuditModule/PrismaModule are: the invitation
/// service (a later phase) will inject MailService without re-importing this
/// module. The concrete provider is chosen once, here, from configuration.
///
/// MailOutbox is exported solely so the TEST-ONLY TestSupportModule can read the
/// captured invitation emails — the only way an e2e test can reach a raw token,
/// which is never persisted. That module is registered under NODE_ENV=test only,
/// and in production the provider that writes to the outbox (OutboxMailService)
/// is never selected, so the outbox stays empty and no route exposes it.
@Global()
@Module({
  providers: [
    MailOutbox,
    {
      provide: MailService,
      useFactory: (config: ConfigService, outbox: MailOutbox): MailService => {
        const app = config.get<AppConfig>("app")!;
        const invitation = config.get<InvitationConfig>("invitation")!;
        return createMailService({
          nodeEnv: app.nodeEnv,
          smtpUrl: invitation.smtpUrl,
          mailFrom: invitation.mailFrom,
          outbox,
        });
      },
      inject: [ConfigService, MailOutbox],
    },
  ],
  exports: [MailService, MailOutbox],
})
export class MailModule {}
