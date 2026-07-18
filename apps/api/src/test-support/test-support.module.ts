import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module";
import { PrismaModule } from "../prisma/prisma.module";
import { TestSupportController } from "./test-support.controller";

/// TEST-ONLY module. AppModule pulls it in through `testSupportImports()`, which
/// yields it only under NODE_ENV=test — so a production build registers zero
/// extra routes and zero extra providers.
///
/// It depends on MailModule solely for the MailOutbox the dev/test mail provider
/// already writes to, and on PrismaModule to backdate an invitation's expiry.
@Module({
  imports: [MailModule, PrismaModule],
  controllers: [TestSupportController],
})
export class TestSupportModule {}

/// The single gate deciding whether the test surface exists. Exported as a
/// function so the rule itself is directly unit-testable, instead of having to
/// re-import AppModule under a mutated environment.
export function testSupportImports(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): Array<typeof TestSupportModule> {
  return nodeEnv === "test" ? [TestSupportModule] : [];
}
